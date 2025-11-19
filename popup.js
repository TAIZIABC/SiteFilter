class ElementHiderPopup {
    constructor() {
        this.rules = [];
        this.isEnabled = true;
        this.hiddenCount = 0;
        this.currentDomain = '';
        this.currentFilter = 'current'; // 'current' 或 'all'
        
        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
        this.updateCurrentTab();
    }

    initializeElements() {
        this.enableToggle = document.getElementById('enableToggle');
        this.classNameInput = document.getElementById('classNameInput');
        this.addButton = document.getElementById('addButton');
        this.rulesList = document.getElementById('rulesList');
        this.ruleCount = document.getElementById('ruleCount');
        this.hiddenCountEl = document.getElementById('hiddenCount');
        this.currentDomainEl = document.getElementById('currentDomain');
        this.refreshButton = document.getElementById('refreshButton');
        this.clearSiteButton = document.getElementById('clearSiteButton');
        this.inspectButton = document.getElementById('inspectButton');
        
        // 快速选择器按钮
        this.quickButtons = document.querySelectorAll('.quick-btn');
        
        // 过滤标签
        this.filterTabs = document.querySelectorAll('.filter-tab');
    }

    bindEvents() {
        this.enableToggle.addEventListener('change', () => this.toggleEnabled());
        this.addButton.addEventListener('click', () => this.addRule());
        this.classNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addRule();
        });
        this.refreshButton.addEventListener('click', () => this.refreshCurrentTab());
        this.clearSiteButton.addEventListener('click', () => this.clearSiteRules());
        this.inspectButton.addEventListener('click', () => this.startInspectMode());
        
        // 快速选择器按钮
        this.quickButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const selector = btn.dataset.selector;
                this.classNameInput.value = selector;
                this.validateInput();
            });
        });
        
        // 过滤标签
        this.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchFilter(tab.dataset.filter);
            });
        });
        
        // 实时输入验证
        this.classNameInput.addEventListener('input', () => this.validateInput());
    }

    validateInput() {
        const value = this.classNameInput.value.trim();
        const isValid = this.isValidSelector(value);
        
        this.classNameInput.style.borderColor = isValid || !value ? '#e1e5e9' : '#dc3545';
        this.addButton.disabled = !isValid || !value;
    }

    isValidSelector(selector) {
        if (!selector) return false;
        
        try {
            // 基本的CSS选择器验证
            if (selector.match(/^[.#]?[a-zA-Z][\w-]*$/)) return true;
            if (selector.match(/^[a-zA-Z][\w-]*$/)) return true;
            
            // 尝试使用querySelector验证
            document.querySelector(selector);
            return true;
        } catch (e) {
            return false;
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['rules', 'isEnabled']);
            this.rules = result.rules || [];
            this.isEnabled = result.isEnabled !== false;
            
            this.enableToggle.checked = this.isEnabled;
            this.updateRulesList();
            this.updateStats();
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({
                rules: this.rules,
                isEnabled: this.isEnabled
            });
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    async toggleEnabled() {
        this.isEnabled = this.enableToggle.checked;
        await this.saveSettings();
        await this.applyRulesToCurrentTab();
        this.updateStats();
    }

    async addRule() {
        const className = this.classNameInput.value.trim();
        
        if (!className || !this.isValidSelector(className)) {
            this.showError('请输入有效的CSS选择器');
            return;
        }

        // 检查是否已存在
        if (this.rules.some(rule => rule.selector === className)) {
            this.showError('该规则已存在');
            return;
        }

        const newRule = {
            id: Date.now().toString(),
            selector: className,
            enabled: true,
            domain: this.currentDomain,
            createdAt: new Date().toISOString()
        };

        this.rules.push(newRule);
        this.classNameInput.value = '';
        this.classNameInput.style.borderColor = '#e1e5e9';
        
        await this.saveSettings();
        this.updateRulesList();
        await this.applyRulesToCurrentTab();
        this.updateStats();
        
        this.showSuccess('规则添加成功');
    }

    async deleteRule(ruleId) {
        this.rules = this.rules.filter(rule => rule.id !== ruleId);
        console.log(ruleId,this.rules,  22222)
        await this.saveSettings();
        this.updateRulesList();
        await this.applyRulesToCurrentTab();
        this.updateStats();
    }

    async toggleRule(ruleId) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (rule) {
            rule.enabled = !rule.enabled;
            await this.saveSettings();
            await this.applyRulesToCurrentTab();
            this.updateStats();
        }
    }

    updateRulesList() {
        // 根据当前过滤器筛选规则
        let filteredRules = this.rules;
        if (this.currentFilter === 'current') {
            filteredRules = this.rules.filter(rule => 
                rule.domain === this.currentDomain || !rule.domain
            );
        }
        
        this.ruleCount.textContent = `(${filteredRules.length})`;
        
        if (filteredRules.length === 0) {
            const emptyMessage = this.currentFilter === 'current' 
                ? '当前网站暂无隐藏规则' 
                : '暂无隐藏规则';
            
            this.rulesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎯</div>
                    <div>${emptyMessage}</div>
                    <div style="font-size: 12px; margin-top: 8px; color: #999;">
                        添加CSS选择器来隐藏页面元素
                    </div>
                </div>
            `;
            return;
        }

        this.rulesList.innerHTML = filteredRules.map(rule => {
            const domainLabel = rule.domain && this.currentFilter === 'all' 
                ? `<span class="rule-domain">${rule.domain}</span>` 
                : '';
            
            return `
                <li class="rule-item" data-rule-id="${rule.id}">
                    <div class="rule-content">
                        <span class="rule-text">${this.escapeHtml(rule.selector)}</span>
                        ${domainLabel}
                    </div>
                    <div class="rule-actions">
                        <label class="toggle-switch rule-toggle">
                            <input type="checkbox" ${rule.enabled ? 'checked' : ''} 
                                   data-rule-id="${rule.id}" class="rule-toggle-input">
                            <span class="slider"></span>
                        </label>
                        <button class="delete-btn" data-rule-id="${rule.id}">删除</button>
                    </div>
                </li>
            `;
        }).join('');
        
        // 为新创建的元素添加事件监听器
        this.bindRuleEvents();
    }

    bindRuleEvents() {
        // 为切换开关添加事件监听器
        const toggleInputs = this.rulesList.querySelectorAll('.rule-toggle-input');
        toggleInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const ruleId = e.target.dataset.ruleId;
                this.toggleRule(ruleId);
            });
        });

        // 为删除按钮添加事件监听器
        const deleteButtons = this.rulesList.querySelectorAll('.delete-btn');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const ruleId = e.target.dataset.ruleId;
                this.deleteRule(ruleId);
            });
        });
    }

    async updateCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const url = new URL(tab.url);
                this.currentDomain = url.hostname;
                this.currentDomainEl.textContent = this.currentDomain;
                
                // 获取当前页面隐藏的元素数量
                await this.getHiddenElementsCount();
            }
        } catch (error) {
            console.error('获取当前标签页信息失败:', error);
            this.currentDomainEl.textContent = '未知';
        }
    }

    async getHiddenElementsCount() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        return document.querySelectorAll('[data-element-hider-hidden="true"]').length;
                    }
                });
                
                if (results && results[0]) {
                    this.hiddenCount = results[0].result || 0;
                    this.updateStats();
                }
            }
        } catch (error) {
            console.error('获取隐藏元素数量失败:', error);
        }
    }

    async applyRulesToCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: this.applyHidingRules,
                    args: [this.rules, this.isEnabled]
                });
                
                // 更新隐藏元素数量
                setTimeout(() => this.getHiddenElementsCount(), 100);
            }
        } catch (error) {
            console.error('应用规则失败:', error);
        }
    }

    // 这个函数会被注入到页面中执行
    applyHidingRules(rules, isEnabled) {
        // 移除之前的样式
        const existingStyle = document.getElementById('element-hider-style');
        if (existingStyle) {
            existingStyle.remove();
        }

        // 移除所有隐藏标记
        document.querySelectorAll('[data-element-hider-hidden]').forEach(el => {
            el.removeAttribute('data-element-hider-hidden');
        });

        if (!isEnabled || !rules || rules.length === 0) {
            return;
        }

        // 创建新的样式规则
        const enabledRules = rules.filter(rule => rule.enabled);
        if (enabledRules.length === 0) return;

        const style = document.createElement('style');
        style.id = 'element-hider-style';
        
        const cssRules = enabledRules.map(rule => {
            return `${rule.selector} { display: none !important; }`;
        }).join('\n');
        
        style.textContent = cssRules;
        document.head.appendChild(style);

        // 标记被隐藏的元素
        enabledRules.forEach(rule => {
            try {
                const elements = document.querySelectorAll(rule.selector);
                elements.forEach(el => {
                    el.setAttribute('data-element-hider-hidden', 'true');
                });
            } catch (error) {
                console.warn('无效的选择器:', rule.selector, error);
            }
        });
    }

    async refreshCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await chrome.tabs.reload(tab.id);
                window.close();
            }
        } catch (error) {
            console.error('刷新页面失败:', error);
        }
    }

    async clearSiteRules() {
        const siteRules = this.rules.filter(rule => 
            rule.domain === this.currentDomain || !rule.domain
        );
        
        if (siteRules.length === 0) {
            this.showError('当前网站没有隐藏规则');
            return;
        }
        
        if (confirm(`确定要清空 ${this.currentDomain} 的所有隐藏规则吗？`)) {
            this.rules = this.rules.filter(rule => 
                rule.domain !== this.currentDomain && rule.domain
            );
            await this.saveSettings();
            this.updateRulesList();
            await this.applyRulesToCurrentTab();
            this.updateStats();
            this.showSuccess('当前网站规则已清空');
        }
    }

    switchFilter(filter) {
        this.currentFilter = filter;
        
        // 更新标签状态
        this.filterTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });
        
        // 更新规则列表
        this.updateRulesList();
    }

    async startInspectMode() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                // 注入检查脚本
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: this.enableInspectMode
                });
                
                // 关闭弹窗，让用户在页面上选择元素
                window.close();
            }
        } catch (error) {
            console.error('启动检查模式失败:', error);
            this.showError('无法在此页面启动检查模式');
        }
    }

    // 这个函数会被注入到页面中
    enableInspectMode() {
        // 创建提示覆盖层
        const overlay = document.createElement('div');
        overlay.id = 'element-hider-inspect-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.3);
            z-index: 999999;
            cursor: crosshair;
        `;
        
        const tooltip = document.createElement('div');
        tooltip.id = 'element-hider-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: #333;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000000;
            display: none;
        `;
        
        const instructions = document.createElement('div');
        instructions.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #667eea;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        instructions.textContent = '点击要隐藏的元素，按 ESC 取消';
        
        document.body.appendChild(overlay);
        document.body.appendChild(tooltip);
        document.body.appendChild(instructions);
        
        let highlightedElement = null;
        
        function highlightElement(element) {
            // 移除之前的高亮
            if (highlightedElement) {
                highlightedElement.style.outline = '';
            }
            
            // 高亮当前元素
            if (element && element !== overlay && element !== tooltip && element !== instructions) {
                element.style.outline = '2px solid #ff6b6b';
                highlightedElement = element;
                
                // 显示选择器信息
                const selector = generateSelector(element);
                tooltip.textContent = selector;
                tooltip.style.display = 'block';
            }
        }
        
        function generateSelector(element) {
            // 生成CSS选择器
            if (element.id) {
                return `#${element.id}`;
            }
            
            if (element.className) {
                const classes = element.className.split(' ').filter(c => c.trim());
                if (classes.length > 0) {
                    return `.${classes[0]}`;
                }
            }
            
            return element.tagName.toLowerCase();
        }
        
        function cleanup() {
            if (highlightedElement) {
                highlightedElement.style.outline = '';
            }
            overlay.remove();
            tooltip.remove();
            instructions.remove();
        }
        
        // 鼠标移动事件
        overlay.addEventListener('mousemove', (e) => {
            const element = document.elementFromPoint(e.clientX, e.clientY);
            highlightElement(element);
            
            tooltip.style.left = e.clientX + 10 + 'px';
            tooltip.style.top = e.clientY - 30 + 'px';
        });
        
        // 点击事件
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const element = document.elementFromPoint(e.clientX, e.clientY);
            if (element && element !== overlay) {
                const selector = generateSelector(element);
                
                // 发送选择器到扩展
                chrome.runtime.sendMessage({
                    action: 'addSelectorFromInspect',
                    selector: selector
                });
                
                cleanup();
            }
        });
        
        // ESC 键取消
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cleanup();
            }
        }, { once: true });
    }

    updateStats() {
        this.hiddenCountEl.textContent = this.hiddenCount;
        
        // 更新启用状态的视觉反馈
        document.body.style.opacity = this.isEnabled ? '1' : '0.7';
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        // 创建临时消息提示
        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            color: white;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
        `;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 2000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全局实例
let popup;

document.addEventListener('DOMContentLoaded', () => {
    popup = new ElementHiderPopup();
});