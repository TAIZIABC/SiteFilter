class ElementHiderContent {
    constructor() {
        this.isEnabled = true;
        this.rules = [];
        this.observer = null;
        
        this.init();
    }

    async init() {
        // 加载设置
        await this.loadSettings();
        
        // 应用初始规则
        this.applyRules();
        
        // 监听设置变化
        this.listenForSettingsChanges();
        
        // 监听DOM变化
        this.startObserving();
        
        // 监听来自popup的消息
        this.listenForMessages();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['rules', 'isEnabled']);
            this.rules = result.rules || [];
            this.isEnabled = result.isEnabled !== false;
        } catch (error) {
            console.error('Element Hider: 加载设置失败', error);
        }
    }

    listenForSettingsChanges() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                let shouldReapply = false;
                
                if (changes.rules) {
                    this.rules = changes.rules.newValue || [];
                    shouldReapply = true;
                }
                
                if (changes.isEnabled) {
                    this.isEnabled = changes.isEnabled.newValue !== false;
                    shouldReapply = true;
                }
                
                if (shouldReapply) {
                    this.applyRules();
                }
            }
        });
    }

    listenForMessages() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'applyRules') {
                this.rules = request.rules || [];
                this.isEnabled = request.isEnabled !== false;
                this.applyRules();
                sendResponse({ success: true });
            } else if (request.action === 'getHiddenCount') {
                const count = document.querySelectorAll('[data-element-hider-hidden="true"]').length;
                sendResponse({ count });
            }
        });
    }

    applyRules() {
        // 移除之前的样式
        this.removeExistingStyles();
        
        // 移除所有隐藏标记
        this.removeHiddenMarkers();
        
        if (!this.isEnabled || !this.rules || this.rules.length === 0) {
            return;
        }

        // 应用新规则
        this.applyHidingStyles();
        
        // 标记隐藏的元素
        this.markHiddenElements();
    }

    removeExistingStyles() {
        const existingStyles = document.querySelectorAll('#element-hider-style, [data-element-hider-style]');
        existingStyles.forEach(style => style.remove());
    }

    removeHiddenMarkers() {
        const hiddenElements = document.querySelectorAll('[data-element-hider-hidden]');
        hiddenElements.forEach(el => {
            el.removeAttribute('data-element-hider-hidden');
        });
    }

    applyHidingStyles() {
        // 获取当前域名
        const currentDomain = window.location.hostname;
        
        // 筛选适用于当前网站的规则
        const enabledRules = this.rules.filter(rule => 
            rule.enabled && (rule.domain === currentDomain || !rule.domain)
        );
        
        if (enabledRules.length === 0) return;

        const style = document.createElement('style');
        style.id = 'element-hider-style';
        style.setAttribute('data-element-hider-style', 'true');
        
        const cssRules = enabledRules.map(rule => {
            // 确保选择器安全
            const safeSelector = this.sanitizeSelector(rule.selector);
            return `${safeSelector} { 
                display: none !important; 
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                overflow: hidden !important;
            }`;
        }).join('\n');
        
        style.textContent = cssRules;
        
        // 插入到head的最前面，确保优先级
        if (document.head) {
            document.head.insertBefore(style, document.head.firstChild);
        } else {
            // 如果head还不存在，等待DOM加载
            document.addEventListener('DOMContentLoaded', () => {
                if (document.head) {
                    document.head.insertBefore(style, document.head.firstChild);
                }
            });
        }
    }

    markHiddenElements() {
        // 获取当前域名
        const currentDomain = window.location.hostname;
        
        // 筛选适用于当前网站的规则
        const enabledRules = this.rules.filter(rule => 
            rule.enabled && (rule.domain === currentDomain || !rule.domain)
        );
        
        enabledRules.forEach(rule => {
            try {
                const safeSelector = this.sanitizeSelector(rule.selector);
                const elements = document.querySelectorAll(safeSelector);
                elements.forEach(el => {
                    el.setAttribute('data-element-hider-hidden', 'true');
                    el.setAttribute('data-element-hider-rule', rule.id);
                });
            } catch (error) {
                console.warn('Element Hider: 无效的选择器', rule.selector, error);
            }
        });
    }

    sanitizeSelector(selector) {
        // 基本的选择器清理，防止注入攻击
        if (typeof selector !== 'string') return '';
        
        // 移除潜在危险字符
        selector = selector.replace(/[<>'"]/g, '');
        
        // 确保选择器不为空
        if (!selector.trim()) return '';
        
        return selector.trim();
    }

    startObserving() {
        // 使用MutationObserver监听DOM变化
        this.observer = new MutationObserver((mutations) => {
            let shouldReapply = false;
            
            mutations.forEach((mutation) => {
                // 检查是否有新节点添加
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // 检查新添加的节点是否匹配我们的规则
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (this.shouldHideElement(node)) {
                                shouldReapply = true;
                                break;
                            }
                        }
                    }
                }
            });
            
            if (shouldReapply) {
                // 使用防抖，避免频繁重新应用规则
                this.debounceReapply();
            }
        });

        // 开始观察
        this.observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });
    }

    shouldHideElement(element) {
        if (!this.isEnabled || !this.rules) return false;
        
        // 获取当前域名
        const currentDomain = window.location.hostname;
        
        // 筛选适用于当前网站的规则
        const enabledRules = this.rules.filter(rule => 
            rule.enabled && (rule.domain === currentDomain || !rule.domain)
        );
        
        return enabledRules.some(rule => {
            try {
                const safeSelector = this.sanitizeSelector(rule.selector);
                return element.matches && element.matches(safeSelector);
            } catch (error) {
                return false;
            }
        });
    }

    debounceReapply() {
        if (this.reapplyTimeout) {
            clearTimeout(this.reapplyTimeout);
        }
        
        this.reapplyTimeout = setTimeout(() => {
            this.markHiddenElements();
        }, 100);
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.reapplyTimeout) {
            clearTimeout(this.reapplyTimeout);
        }
        
        this.removeExistingStyles();
        this.removeHiddenMarkers();
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ElementHiderContent();
    });
} else {
    new ElementHiderContent();
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.elementHiderContent) {
        window.elementHiderContent.destroy();
    }
});