class ElementHiderBackground {
    constructor() {
        this.init();
    }

    init() {
        // 监听扩展安装
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstall(details);
        });

        // 监听标签页更新
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // 监听来自content script的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
        });

        // 监听存储变化
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.handleStorageChange(changes, namespace);
        });
    }

    async handleInstall(details) {
        if (details.reason === 'install') {
            // 首次安装时的初始化
            await this.initializeDefaultSettings();
            
            // 打开欢迎页面或设置页面
            chrome.tabs.create({
                url: chrome.runtime.getURL('popup.html')
            });
        } else if (details.reason === 'update') {
            // 更新时的处理
            await this.handleUpdate(details.previousVersion);
        }
    }

    async initializeDefaultSettings() {
        try {
            const result = await chrome.storage.sync.get(['rules', 'isEnabled']);
            
            // 如果没有设置，则初始化默认值
            if (!result.rules) {
                await chrome.storage.sync.set({
                    rules: [],
                    isEnabled: true,
                    version: '1.0.0',
                    installDate: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Element Hider: 初始化设置失败', error);
        }
    }

    async handleUpdate(previousVersion) {
        try {
            // 处理版本更新逻辑
            const currentVersion = chrome.runtime.getManifest().version;
            
            // 可以在这里添加版本迁移逻辑
            await chrome.storage.sync.set({
                version: currentVersion,
                lastUpdateDate: new Date().toISOString(),
                previousVersion: previousVersion
            });
            
            console.log(`Element Hider: 从版本 ${previousVersion} 更新到 ${currentVersion}`);
        } catch (error) {
            console.error('Element Hider: 处理更新失败', error);
        }
    }

    async handleTabUpdate(tabId, changeInfo, tab) {
        // 当页面加载完成时，应用隐藏规则
        if (changeInfo.status === 'complete' && tab.url) {
            try {
                // 检查是否是有效的网页URL
                if (this.isValidWebUrl(tab.url)) {
                    await this.applyRulesToTab(tabId);
                }
            } catch (error) {
                console.error('Element Hider: 应用规则到标签页失败', error);
            }
        }
    }

    isValidWebUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    async applyRulesToTab(tabId) {
        try {
            const result = await chrome.storage.sync.get(['rules', 'isEnabled']);
            const rules = result.rules || [];
            const isEnabled = result.isEnabled !== false;

            // 向content script发送消息
            await chrome.tabs.sendMessage(tabId, {
                action: 'applyRules',
                rules: rules,
                isEnabled: isEnabled
            });
        } catch (error) {
            // 忽略无法发送消息的错误（比如特殊页面）
            console.debug('Element Hider: 无法向标签页发送消息', error);
        }
    }

    handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'getRules':
                this.getRules().then(sendResponse);
                return true; // 异步响应

            case 'saveRules':
                this.saveRules(request.rules).then(sendResponse);
                return true;

            case 'getSettings':
                this.getSettings().then(sendResponse);
                return true;

            case 'updateSettings':
                this.updateSettings(request.settings).then(sendResponse);
                return true;

            case 'applyToAllTabs':
                this.applyRulesToAllTabs().then(sendResponse);
                return true;

            case 'addSelectorFromInspect':
                this.handleInspectSelector(request.selector).then(sendResponse);
                return true;

            default:
                sendResponse({ error: '未知的操作' });
        }
    }

    async getRules() {
        try {
            const result = await chrome.storage.sync.get(['rules']);
            return { success: true, rules: result.rules || [] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async saveRules(rules) {
        try {
            await chrome.storage.sync.set({ rules });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getSettings() {
        try {
            const result = await chrome.storage.sync.get(['rules', 'isEnabled', 'version']);
            return {
                success: true,
                settings: {
                    rules: result.rules || [],
                    isEnabled: result.isEnabled !== false,
                    version: result.version || '1.0.0'
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateSettings(settings) {
        try {
            await chrome.storage.sync.set(settings);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async applyRulesToAllTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            const promises = tabs.map(tab => {
                if (this.isValidWebUrl(tab.url)) {
                    return this.applyRulesToTab(tab.id);
                }
                return Promise.resolve();
            });
            
            await Promise.allSettled(promises);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    handleStorageChange(changes, namespace) {
        if (namespace === 'sync') {
            // 当设置发生变化时，通知所有标签页
            if (changes.rules || changes.isEnabled) {
                this.notifyAllTabs(changes);
            }
        }
    }

    async notifyAllTabs(changes) {
        try {
            const tabs = await chrome.tabs.query({});
            const promises = tabs.map(tab => {
                if (this.isValidWebUrl(tab.url)) {
                    return chrome.tabs.sendMessage(tab.id, {
                        action: 'settingsChanged',
                        changes: changes
                    }).catch(() => {
                        // 忽略无法发送消息的错误
                    });
                }
                return Promise.resolve();
            });
            
            await Promise.allSettled(promises);
        } catch (error) {
            console.error('Element Hider: 通知所有标签页失败', error);
        }
    }

    async handleInspectSelector(selector) {
        try {
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                return { success: false, error: '无法获取当前标签页' };
            }

            const domain = new URL(tab.url).hostname;
            
            // 获取现有规则
            const result = await chrome.storage.sync.get(['rules']);
            const rules = result.rules || [];
            
            // 检查规则是否已存在
            const existingRule = rules.find(rule => 
                rule.selector === selector && rule.domain === domain
            );
            
            if (existingRule) {
                return { success: false, error: '该规则已存在' };
            }
            
            // 添加新规则
            const newRule = {
                id: Date.now().toString(),
                selector: selector,
                enabled: true,
                domain: domain,
                createdAt: new Date().toISOString()
            };
            
            rules.push(newRule);
            await chrome.storage.sync.set({ rules });
            
            // 应用规则到当前标签页
            await this.applyRulesToTab(tab.id);
            
            return { success: true, rule: newRule };
        } catch (error) {
            console.error('Element Hider: 处理检查选择器失败', error);
            return { success: false, error: error.message };
        }
    }
}

// 初始化背景脚本
new ElementHiderBackground();