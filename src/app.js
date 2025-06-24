// API endpoint list
const API_URL_LIST = [
    { name: "panda443212.workers.dev", url: "https://cloud-reader-turso-api.panda443212.workers.dev" },
    { name: "yaya101ed.workers.dev", url: "https://cloud-reader-turso-api.yaya101ed.workers.dev" }
];

// 获取保存的API_URL或使用默认值
let API_URL = localStorage.getItem('selected_api_url') || API_URL_LIST[0].url;
const CACHE_TTL_SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000; // 6个月的毫秒数

// snackbar 初始化
const snackbar = {
    success(message) {
        mdui.snackbar({
            message: message,
            autoCloseDelay: 2000,
            position: 'bottom',
            closeable: true
        });
    },
    error(message) {
        mdui.snackbar({
            message: message,
            autoCloseDelay: 3000,
            position: 'bottom',
            closeable: true
        });
    },
    info(message) {
        mdui.snackbar({
            message: message,
            autoCloseDelay: 2000,
            position: 'bottom',
            closeable: true
        });
    }
};

// 全局状态
let currentUser = null;
let currentBook = null;
let currentChapter = 0;
let currentChapterData = null;
let currentFolder = "";
let bookListPage = 1;
let bookListPageSize = 100;
let bookListHasMore = true;

let currentFilter = "all";
let lastSearchQuery = ""; // 保存最后一次搜索查询

let userRules = [];
let userRulesDefault = [
    {
        "id": -1,
        "enable": true,
        "name": "目录(去空白)",
        "rule": "(?<=[　\\s])(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和]))).{0,30}$",
        "example": "第一章 假装第一章前面有空白但我不要",
        "serialNumber": 0
    },
    {
        "id": -2,
        "enable": true,
        "name": "目录",
        "rule": "^[ 　\\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张))).{0,30}$",
        "example": "第一章 标准的粤语就是这样",
        "serialNumber": 1
    },
    {
        "id": -3,
        "enable": false,
        "name": "目录(匹配简介)",
        "rule": "(?<=[　\\s])(?:(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|回(?![合来事去])|场(?![和合比电是])|篇(?!张))).{0,30}$",
        "example": "简介 老夫诸葛村夫",
        "serialNumber": 2
    },
    {
        "id": -4,
        "enable": false,
        "name": "目录(古典、轻小说备用)",
        "rule": "^[ 　\\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|回(?![合来事去])|场(?![和合比电是])|话|篇(?!张))).{0,30}$",
        "example": "第一章 比上面只多了回和话",
        "serialNumber": 3
    },
    {
        "id": -5,
        "enable": false,
        "name": "数字(纯数字标题)",
        "rule": "(?<=[　\\s])\\d+\\.?[ 　\\t]{0,4}$",
        "example": "12",
        "serialNumber": 4
    },
    {
        "id": -6,
        "enable": false,
        "name": "大写数字(纯数字标题)",
        "rule": "(?<=[　\\s])[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,12}[ 　\\t]{0,4}$",
        "example": "一百七十",
        "serialNumber": 5
    },
    {
        "id": -7,
        "enable": false,
        "name": "数字混合(纯数字标题)",
        "rule": "(?<=[　\\s])[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟\\d]{1,12}[ 　\\t]{0,4}$",
        "example": "12\n一百七十",
        "serialNumber": 6
    },
    {
        "id": -8,
        "enable": true,
        "name": "数字 分隔符 标题名称",
        "rule": "^[ 　\\t]{0,4}\\d{1,5}[:：,.， 、_--\\-].{1,30}$",
        "example": "1、这个就是标题",
        "serialNumber": 7
    },
    {
        "id": -9,
        "enable": true,
        "name": "大写数字 分隔符 标题名称",
        "rule": "^[ 　\\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章?)[ 、_--\\-].{1,30}$",
        "example": "一、只有前面的数字有差别\n二十四章 我瞎编的标题",
        "serialNumber": 8
    },
    {
        "id": -10,
        "enable": false,
        "name": "数字混合 分隔符 标题名称",
        "rule": "^[ 　\\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章?[ 、_--\\-]|\\d{1,5}章?[:：,.， 、_--\\-]).{0,30}$",
        "example": "1、人参公鸡\n二百二十章 boy next door",
        "serialNumber": 9
    },
    {
        "id": -11,
        "enable": true,
        "name": "正文 标题/序号",
        "rule": "^[ 　\\t]{0,4}正文[ 　]{1,4}.{0,20}$",
        "example": "正文 我奶常山赵子龙",
        "serialNumber": 10
    },
    {
        "id": -12,
        "enable": true,
        "name": "Chapter/Section/Part/Episode 序号 标题",
        "rule": "^[ 　\\t]{0,4}(?:[Cc]hapter|[Ss]ection|[Pp]art|ＰＡＲＴ|[Nn][oO][.、]|[Ee]pisode|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)\\s{0,4}\\d{1,4}.{0,30}$",
        "example": "Chapter 1 MyGrandmaIsNB",
        "serialNumber": 11
    },
    {
        "id": -13,
        "enable": false,
        "name": "Chapter(去简介)",
        "rule": "^[ 　\\t]{0,4}(?:[Cc]hapter|[Ss]ection|[Pp]art|ＰＡＲＴ|[Nn][Oo]\\.|[Ee]pisode)\\s{0,4}\\d{1,4}.{0,30}$",
        "example": "Chapter 1 MyGrandmaIsNB",
        "serialNumber": 12
    },
    {
        "id": -14,
        "enable": true,
        "name": "特殊符号 序号 标题",
        "rule": "(?<=[\\s　])[【〔〖「『〈［\\[](?:第|[Cc]hapter)[\\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,10}[章节].{0,20}$",
        "example": "【第一章 后面的符号可以没有",
        "serialNumber": 13
    },
    {
        "id": -15,
        "enable": false,
        "name": "特殊符号 标题(成对)",
        "rule": "(?<=[\\s　]{0,4})(?:[\\[〈「『〖〔《（【\\(].{1,30}[\\)】）》〕〗』」〉\\]]?|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)[ 　]{0,4}$",
        "example": "『加个直角引号更专业』\n(11)我奶常山赵子聋",
        "serialNumber": 14
    },
    {
        "id": -16,
        "enable": true,
        "name": "特殊符号 标题(单个)",
        "rule": "(?<=[\\s　]{0,4})(?:[☆★✦✧].{1,30}|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)[ 　]{0,4}$",
        "example": "☆、晋江作者最喜欢的格式",
        "serialNumber": 15
    },
    {
        "id": -17,
        "enable": true,
        "name": "章/卷 序号 标题",
        "rule": "^[ \\t　]{0,4}(?:(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[卷章][\\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8})[ 　]{0,4}.{0,30}$",
        "example": "卷五 开源盛世",
        "serialNumber": 16
    },
    {
        "id": -18,
        "enable": false,
        "name": "顶格标题",
        "rule": "^\\S.{1,20}$",
        "example": "20字以内顶格写的都是标题",
        "serialNumber": 17
    },
    {
        "id": -19,
        "enable": false,
        "name": "双标题(前向)",
        "rule": "(?m)(?<=[ \\t　]{0,4})第[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章.{0,30}$(?=[\\s　]{0,8}第[\\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章)",
        "example": "第一章 真正的标题\n第一章 这个不要",
        "serialNumber": 18
    },
    {
        "id": -20,
        "enable": false,
        "name": "双标题(后向)",
        "rule": "(?m)(?<=[ \\t　]{0,4}第[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章.{0,30}$[\\s　]{0,8})第[\\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章.{0,30}$",
        "example": "第一章 这个标题不要\n第一章真正的标题",
        "serialNumber": 19
    },
    {
        "id": -21,
        "enable": true,
        "name": "书名 括号 序号",
        "rule": "^[一-龥]{1,20}[ 　\\t]{0,4}[(（][\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[)）][ 　\\t]{0,4}$",
        "example": "标题后面数字有括号(12)",
        "serialNumber": 20
    },
    {
        "id": -22,
        "enable": true,
        "name": "书名 序号",
        "rule": "^[一-龥]{1,20}[ 　\\t]{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[ 　\\t]{0,4}$",
        "example": "标题后面数字没有括号124",
        "serialNumber": 21
    },
    {
        "id": -23,
        "enable": false,
        "name": "特定字符 标题 特定符号",
        "rule": "(?<=\\={3,6}).{1,40}?(?=\\=)",
        "example": "===起这种标题干什么===",
        "serialNumber": 22
    },
    {
        "id": -24,
        "enable": true,
        "name": "字数分割 分节阅读",
        "rule": "(?<=[ 　\\t]{0,4})(?:.{0,15}分[页节章段]阅读[-_ ]|第\\s{0,4}[\\d零一二两三四五六七八九十百千万]{1,6}\\s{0,4}[页节]).{0,30}$",
        "example": "分节|分页|分段阅读\n第一页",
        "serialNumber": 23
    },
    {
        "id": -25,
        "enable": false,
        "name": "通用规则",
        "rule": "(?im)^.{0,6}(?:[引楔]子|正文(?!完|结)|[引序前]言|[序终]章|扉页|[上中下][部篇卷]|卷首语|后记|尾声|番外|={2,4}|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|页[、 　]|集(?![合和])|部(?![分是门落])|篇(?!张))).{0,40}$|^.{0,6}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟a-z]{1,8}[、. 　].{0,20}$",
        "example": "激进规则,适配更多非常用格式",
        "serialNumber": 24
    }
];

let selectionMode = false;
let selectedBooks = new Set();

// 默认用户设置
let userSettings = {
    fontSize: 18,
    lineSpacing: 1.6,
    fontFamily: "'Noto Serif SC', serif",
    firstLineIndent: 2,
    letterSpacing: 0,
    paragraphSpacing: 1,
    colorTheme: "default",
    darkMode: false,
    favorites: [],
    recentBooks: [],
    primaryColor: '#2196f3',
    avatar: null,
    lockApp: false,
    lockPassword: null,
    lockTimeout: 3, // 锁定超时时间（分钟）
    lockDisguiseMode: 'standard', // 锁定界面: standard, calculator
    viewMode: "grid"
}

const userSettingsDefault = userSettings;

// 确保 customVideoSources 在 userSettings 中初始化
if (userSettings.customVideoSources === undefined) {
    userSettings.customVideoSources = [];
}

// 页面历史管理
let pageHistory = [];
let pageScrollPositions = {};

// 模态对话框管理器
const ModalManager = {
    modals: {},

    createModal(id, title, content, options = {}) {
        // 检查是否已存在相同ID的对话框，如果存在则先移除
        const existingModal = this.modals[id] || document.getElementById(id);
        if (existingModal) {
            existingModal.parentNode.removeChild(existingModal);
            delete this.modals[id];
        }

        // 创建对话框元素
        const modal = document.createElement('mdui-dialog');
        modal.id = id;
        modal.setAttribute('close-on-overlay-click', '');
        modal.setAttribute('close-on-esc', '');

        // 设置标题
        if (title) {
            modal.setAttribute('headline', title);
        }

        // 配置选项
        const confirmText = options.confirmText || '确定';
        const cancelText = options.cancelText || '取消';
        const confirmClass = options.confirmClass || '';

        // 添加内容到对话框
        modal.innerHTML = `
            <div class="modal-content modal-body">
                ${content}
            </div>
            <mdui-button slot="action" variant="tonal" class="modal-cancel">${cancelText}</mdui-button>
            <mdui-button slot="action" variant="tonal" class="modal-confirm ${confirmClass}">${confirmText}</mdui-button>
        `;

        document.body.appendChild(modal);
        this.modals[id] = modal;

        return modal;
    },

    show(id, callbacks = {}) {
        const modal = this.modals[id] || document.getElementById(id);
        if (!modal) return null;

        const confirmBtn = modal.querySelector('.modal-confirm');
        const cancelBtn = modal.querySelector('.modal-cancel');

        // 移除之前可能绑定的事件监听器
        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            const handleConfirm = () => {
                if (callbacks.confirm) {
                    callbacks.confirm();
                } else {
                    this.hide(id);
                }
            };

            newConfirmBtn.onclick = handleConfirm;
        }

        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            const handleCancel = () => {
                if (callbacks.cancel) {
                    callbacks.cancel();
                } else {
                    this.hide(id);
                }
            };

            newCancelBtn.onclick = handleCancel;
        }

        // 执行显示后的回调
        if (callbacks.afterShow) {
            setTimeout(() => {
                callbacks.afterShow();
            }, 100);
        }

        modal.open = true;
        return modal;
    },

    hide(id, callback) {
        const modal = this.modals[id] || document.getElementById(id);
        if (!modal) return;

        modal.open = false;

        // 执行关闭后的回调
        if (callback && typeof callback === 'function') {
            // 给动画一点时间完成
            setTimeout(callback, 300);
        }
    },

    confirm(message, title = '确认', options = {}) {
        return new Promise(resolve => {
            const modalId = 'confirm-modal';
            let modal = this.modals[modalId];

            if (!modal) {
                modal = this.createModal(modalId, title, `<p>${message}</p>`, {
                    confirmText: options.confirmText || '确定',
                    cancelText: options.cancelText || '取消',
                    confirmClass: options.confirmClass || ''
                });
            } else {
                modal.setAttribute('headline', title);
                modal.innerHTML = `
                    <p>${message}</p>
                    <mdui-button slot="action" variant="tonal" class="modal-cancel">${options.cancelText || '取消'}</mdui-button>
                    <mdui-button slot="action" variant="tonal" class="modal-confirm ${options.confirmClass || ''}">${options.confirmText || '确定'}</mdui-button>
                `;
            }

            this.show(modalId, {
                confirm: () => {
                    this.hide(modalId);
                    resolve(true);
                },
                cancel: () => {
                    this.hide(modalId);
                    resolve(false);
                }
            });
        });
    },

    danger(message, title = '警告') {
        return this.confirm(message, title, {
            confirmText: '确定',
            confirmClass: 'danger'
        });
    },

    prompt(title, placeholder = '', defaultValue = '') {
        return new Promise(resolve => {
            const modalId = 'prompt-modal';
            let modal = this.modals[modalId];

            const content = `
                <div>
                    <mdui-text-field variant="outlined" id="promptInput" placeholder="${placeholder}" value="${defaultValue}">></mdui-text-field>
                </div>
            `;

            if (!modal) {
                modal = this.createModal(modalId, title, content);
            } else {
                modal.setAttribute('headline', title);
                modal.innerHTML = `
                    ${content}
                    <mdui-button slot="action" variant="tonal" class="modal-cancel">取消</mdui-button>
                    <mdui-button slot="action" variant="tonal" class="modal-confirm">确定</mdui-button>
                `;
            }

            const afterShow = () => {
                const input = document.getElementById('promptInput');
                input.focus();
                input.select();
            };

            this.show(modalId, {
                confirm: () => {
                    const value = document.getElementById('promptInput').value;
                    this.hide(modalId);
                    resolve(value);
                },
                cancel: () => {
                    this.hide(modalId);
                    resolve(null);
                }
            });

            setTimeout(afterShow, 100);
        });
    }
};

// 离线状态管理
const OfflineManager = {
    isOffline: false,
    cachedBooks: new Set(),

    init() {
        // 检测网络状态
        this.updateOfflineStatus();

        // 监听网络状态变化
        window.addEventListener('online', () => {
            this.updateOfflineStatus();
        });

        window.addEventListener('offline', () => {
            this.updateOfflineStatus();
        });

        // 加载已缓存的书籍列表
        this.loadCachedBooksList();
    },

    updateOfflineStatus() {
        this.isOffline = !navigator.onLine;
        this.updateUIForOfflineMode();
    },

    updateUIForOfflineMode() {
        if (this.isOffline) {
            document.body.classList.add('offline');
            this.disableBtn();
        } else {
            document.body.classList.remove('offline');
            this.enableBtn();
        }
    },

    disableBtn() {
        const settingsControls = document.querySelectorAll('mdui-switch, mdui-slider, mdui-select, mdui-checkbox, mdui-button, .color-option, .color-theme');
        settingsControls.forEach(control => {
            control.disabled = true;
        });
    },

    enableBtn() {
        const settingsControls = document.querySelectorAll('mdui-switch, mdui-slider, mdui-select, mdui-checkbox, mdui-button, .color-option, .color-theme');
        settingsControls.forEach(control => {
            control.disabled = false;
        });
    },

    async cacheBookForOffline(bookId) {
        if (!currentUser || !bookId) return false;

        try {
            showLoading('正在缓存书籍...');

            // 获取书籍信息
            const bookInfo = await BookManager.getBookInfo(bookId);
            if (!bookInfo) {
                throw new Error('获取书籍信息失败');
            }

            // 缓存所有章节
            const totalChapters = bookInfo.chapterCount;
            for (let i = 0; i < totalChapters; i++) {
                updateImportProgress(i + 1, totalChapters, ((i + 1) / totalChapters) * 100);
                await BookManager.getChapter(bookId, i);
            }

            // 标记为已缓存
            this.cachedBooks.add(bookId);
            await this.saveCachedBooksList();

            hideLoading();
            snackbar.success('书籍已缓存到本地');

            // 更新UI
            this.updateBookOfflineButtons();
            return true;
        } catch (error) {
            hideLoading();
            console.error('缓存书籍失败:', error);
            snackbar.error('缓存失败: ' + (error.message || '未知错误'));
            return false;
        }
    },

    async removeCachedBook(bookId) {
        if (!bookId) return;

        try {
            // 清除书籍相关缓存
            await CacheManager.remove(`book_info_${bookId}`);

            // 清除所有章节缓存
            const bookInfo = await CacheManager.get(`book_info_${bookId}`);
            if (bookInfo) {
                for (let i = 0; i < bookInfo.chapterCount; i++) {
                    await CacheManager.remove(`chapter_${bookId}_${i}`);
                }
            }

            // 从缓存列表中移除
            this.cachedBooks.delete(bookId);
            await this.saveCachedBooksList();

            snackbar.success('已清除本地缓存');
            this.updateBookOfflineButtons();
        } catch (error) {
            console.error('清除缓存失败:', error);
            snackbar.error('清除缓存失败');
        }
    },

    async isBookCached(bookId) {
        if (!bookId) return false;

        // 检查书籍信息是否缓存
        const bookInfo = await CacheManager.get(`book_info_${bookId}`);
        if (!bookInfo) return false;

        // 检查所有章节是否缓存
        for (let i = 0; i < bookInfo.chapterCount; i++) {
            const chapter = await CacheManager.get(`chapter_${bookId}_${i}`);
            if (!chapter) return false;
        }

        return true;
    },

    updateBookOfflineButtons() {
        document.querySelectorAll('.book-offline-btn').forEach(async (btn) => {
            const bookId = btn.getAttribute('data-book-id');
            if (bookId) {
                const isCached = await this.isBookCached(bookId);
                btn.classList.toggle('cached', isCached);
                btn.innerHTML = isCached ? '<mdui-icon slot="icon" name="offline_pin"></mdui-icon> 清楚缓存' : '<mdui-icon slot="icon" name="download"></mdui-icon> 缓存到本地';
            }
        });
    },

    async loadCachedBooksList() {
        try {
            const cached = await CacheManager.get('offline_cached_books');
            if (cached && Array.isArray(cached)) {
                this.cachedBooks = new Set(cached);
            }
        } catch (error) {
            console.error('加载缓存书籍列表失败:', error);
        }
    },

    async saveCachedBooksList() {
        try {
            await CacheManager.set('offline_cached_books', Array.from(this.cachedBooks), CACHE_TTL_SIX_MONTHS);
        } catch (error) {
            console.error('保存缓存书籍列表失败:', error);
        }
    }
};

// 本地存储缓存管理
const CacheManager = {

    async ui() {
        navigator.storage.estimate().then(({ usage, quota }) => {
            const progressBar = document.querySelector('#storageProgressBar');
            progressBar.value = usage / quota;
            const usageText = Utils.formatFileSize(usage);
            const quotaText = Utils.formatFileSize(quota);
            document.querySelector('#storageText').textContent = `${usageText} / ${quotaText}`;
        });
    },

    async set(key, data, ttl = 3600000) {

        this.ui();

        try {
            const item = {
                data,
                expiry: Date.now() + ttl
            };
            await localforage.setItem(key, JSON.stringify(item));
            return true;
        } catch (err) {
            console.error('缓存写入失败:', err);
            return false;
        }
    },

    async get(key) {

        this.ui();

        try {
            const raw = await localforage.getItem(key);
            if (!raw) return null;
            let item;
            if (typeof raw === 'string') {
                item = JSON.parse(raw);
            } else {
                item = raw;
            }
            if (!item || typeof item.expiry !== 'number') return null;

            if (Date.now() > item.expiry) {
                if (OfflineManager.isOffline) {
                    console.log('离线模式下跳过缓存清空');
                    return;
                } else {
                    // 已经过期
                    await localforage.removeItem(key);
                    return null;
                }
            }
            return item.data;
        } catch (err) {
            console.error('缓存读取失败:', err);
            return null;
        }
    },

    async remove(key) {
        if (OfflineManager.isOffline) {
            console.log('离线模式下跳过缓存删除:', key);
            return true;
        }

        this.ui();

        try {
            await localforage.removeItem(key);
            return true;
        } catch (err) {
            console.error('缓存删除失败:', err);
            return false;
        }
    },

    async clear() {
        // 离线模式下不清空缓存
        if (OfflineManager.isOffline) {
            console.log('离线模式下跳过缓存清空');
            return;
        }

        this.ui();

        try {
            await localforage.clear();
        } catch (err) {
            console.error('缓存清空失败:', err);
        }
    },

    async clearWithPrefix(prefix) {
        // 离线模式下不删除缓存
        if (OfflineManager.isOffline) {
            console.log('离线模式下跳过前缀缓存清理:', prefix);
            return;
        }

        this.ui();

        try {
            const keys = await localforage.keys();
            const toRemove = keys.filter((k) => k.startsWith(prefix));
            await Promise.all(
                toRemove.map((k) => localforage.removeItem(k))
            );
        } catch (err) {
            console.error('按前缀清除缓存失败:', err);
        }
    },

    async getChapterCacheKeys() {
        try {
            const keys = await localforage.keys();
            return keys.filter((k) => k.startsWith('chapter_'));
        } catch (err) {
            console.error('获取章节缓存键失败:', err);
            return [];
        }
    },

    async isChapterCacheValid(key) {
        try {
            const parts = key.split('_');
            if (parts.length < 2) return false;
            const bookId = parts[1];
            if (!bookId) return false;

            // 这里假设 BookManager.getBookInfo(bookId) 返回 Promise<bookInfo|null>
            const bookInfo = await BookManager.getBookInfo(bookId);
            return !!bookInfo;
        } catch (err) {
            console.error('检查章节缓存有效性失败:', err);
            return false;
        }
    },

    async cleanInvalidChapterCaches() {
        try {
            const chapterKeys = await this.getChapterCacheKeys();
            for (const key of chapterKeys) {
                const valid = await this.isChapterCacheValid(key);
                if (!valid) {
                    await this.remove(key);
                    console.log(`已删除无效章节缓存: ${key}`);
                }
            }
        } catch (err) {
            console.error('清理无效章节缓存失败:', err);
        }
    }
};

// 工具函数
const Utils = {
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString('zh-CN');
    },

    debounce(func, wait) {
        let timeout;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    },

    generateHash() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    },

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    isBookFavorited(bookId) {
        return userSettings.favorites && userSettings.favorites.includes(bookId);
    },

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    addToRecentBooks(bookId) {
        if (!userSettings.recentBooks) {
            userSettings.recentBooks = [];
        }
        const index = userSettings.recentBooks.indexOf(bookId);
        if (index !== -1) {
            userSettings.recentBooks.splice(index, 1);
        }
        userSettings.recentBooks.unshift(bookId);
        if (userSettings.recentBooks.length > 10) {
            userSettings.recentBooks = userSettings.recentBooks.slice(0, 10);
        }
        UserManager.saveSettings().catch(err => console.error('保存最近阅读失败', err));
    },

    encrypt(data, password) {
        // 1. 使用 TextEncoder 获取原始字节
        const utf8Bytes = new TextEncoder().encode(data);

        // 2. 使用 pako 压缩
        const compressed = pako.deflate(utf8Bytes);

        // 3. 将压缩结果转成 WordArray（CryptoJS 需要）
        const wordArray = CryptoJS.lib.WordArray.create(compressed);

        // 4. 使用 CryptoJS.AES 加密
        const encrypted = CryptoJS.AES.encrypt(wordArray, password).toString();

        // 5. Base91 编码字符串密文
        const encoded = base91.encode(encrypted);

        return encoded;
    },

    decrypt(encodedData, password) {
        try {
            // 1. Base91 解码
            const encryptedStr = base91.decode(encodedData);

            // 2. 使用 AES 解密，得到 WordArray
            const decryptedWordArray = CryptoJS.AES.decrypt(encryptedStr, password);

            // 3. WordArray -> Uint8Array
            const decryptedBytes = new Uint8Array(decryptedWordArray.sigBytes);
            for (let i = 0; i < decryptedWordArray.sigBytes; i++) {
                decryptedBytes[i] = (decryptedWordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
            }

            // 4. 解压缩
            const decompressed = pako.inflate(decryptedBytes);

            // 5. 转回字符串
            return new TextDecoder().decode(decompressed);
        } catch (e) {
            console.error("解密失败:", e);
            return null;
        }
    },


    // 添加一个批处理工具函数，用于处理大量任务
    processBatch(items, batchProcessor, batchSize = 10, concurrency = 4) {
        return new Promise((resolve, reject) => {
            if (!items || items.length === 0) {
                resolve({ success: true, processed: 0 });
                return;
            }

            let currentIndex = 0;
            let activeJobs = 0;
            let results = [];
            let hasError = false;

            // 启动初始的并发任务
            const startJobs = () => {
                while (activeJobs < concurrency && currentIndex < items.length && !hasError) {
                    // 获取当前批次的数据
                    const end = Math.min(currentIndex + batchSize, items.length);
                    const batch = items.slice(currentIndex, end);
                    currentIndex = end;

                    activeJobs++;

                    // 处理当前批次
                    batchProcessor(batch, currentIndex - batch.length, items.length)
                        .then(result => {
                            results.push(result);
                            activeJobs--;

                            // 继续处理下一批次
                            if (currentIndex < items.length && !hasError) {
                                startJobs();
                            } else if (activeJobs === 0) {
                                // 所有任务完成
                                resolve({
                                    success: true,
                                    processed: items.length,
                                    results: results
                                });
                            }
                        })
                        .catch(error => {
                            hasError = true;
                            activeJobs--;
                            reject(error);
                        });
                }
            };

            // 开始处理
            startJobs();
        });
    }
};

// API服务
const ApiService = {
    async call(endpoint, method = 'GET', data = null, contentType = 'application/json', retries = 3, retryDelay = 500) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const options = {
                    method,
                    headers: {
                        'Content-Type': contentType
                    }
                };
                if (currentUser && currentUser.token) {
                    options.headers['Authorization'] = `Bearer ${currentUser.token}`;
                }
                if (['POST', 'PUT'].includes(method) && data) {
                    options.body = contentType === 'application/json' ? JSON.stringify(data) : data;
                }
                const response = await fetch(`${API_URL}${endpoint}`, options);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '请求失败');
                }

                const responseData = await response.json();
                return responseData;

            } catch (error) {
                console.warn(`API调用失败 (尝试第${attempt}次):`, error);

                if (attempt === retries) {
                    console.error('已达最大重试次数，最终失败:', error);
                    throw error;
                }

                // 等待一段时间再重试
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
};

// 用户管理
const UserManager = {
    async register(username, password) {
        try {
            const passwordHash = CryptoJS.SHA256(password).toString();
            const response = await ApiService.call('/auth/register', 'POST', {
                username,
                password_hash: passwordHash
            });
            return response;
        } catch (error) {
            throw new Error(error.message || '注册失败');
        }
    },

    async login(username, password) {
        try {
            const savedSession = this.getSessionFromStorage();
            if (savedSession && !username) {
                currentUser = savedSession;
                username = savedSession.username;
                password = savedSession.password;
            }

            if (username && password) {
                const passwordHash = CryptoJS.SHA256(password).toString();
                const response = await ApiService.call('/auth/login', 'POST', {
                    username,
                    password_hash: passwordHash
                });

                currentUser = {
                    id: response.user_id,
                    username: response.username,
                    token: response.token,
                    password,
                    createdAt: response.created_at,
                    isAdmin: response.is_admin || false
                };

                this.saveSessionToStorage();
                await this.loadUserSettings();
                return currentUser;
            }

            throw new Error('请提供用户名和密码');
        } catch (error) {
            throw new Error(error.message || '登录失败');
        }
    },

    saveSessionToStorage() {
        if (!currentUser) return;
        const sessionData = {
            id: currentUser.id,
            username: currentUser.username,
            token: currentUser.token,
            password: currentUser.password,
            createdAt: currentUser.createdAt,
            isAdmin: currentUser.isAdmin
        };
        // 确保会话数据中包含用户名
        if (!sessionData.username && currentUser.token) {
            console.warn('会话数据中缺少用户名，这可能导致自动登录失败');
        }
        localStorage.setItem('reader_session', JSON.stringify(sessionData));
    },

    getSessionFromStorage() {
        const sessionData = localStorage.getItem('reader_session');
        if (!sessionData) return null;

        try {
            return JSON.parse(sessionData);
        } catch (e) {
            return null;
        }
    },

    async clearSession() {
        localStorage.removeItem('reader_session');
        await CacheManager.clearWithPrefix('book_');
        await CacheManager.clearWithPrefix('chapter_');
    },

    async loadUserSettings() {
        try {
            const cachedSettings = await CacheManager.get('user_settings');
            if (cachedSettings) {
                userSettings = { ...userSettings, ...cachedSettings.settings };
                userRules = cachedSettings.userRules || userRulesDefault;
                applyUserSettings();
                return true;
            }

            const response = await ApiService.call('/user/settings');

            if (response.settings_data) {
                const settingsDecrypted = Utils.decrypt(response.settings_data, currentUser.password);
                if (settingsDecrypted) {
                    const parsedSettings = JSON.parse(settingsDecrypted);
                    userSettings = { ...userSettings, ...parsedSettings };
                }
            }

            // 加载章节规则
            try {
                const rulesResponse = await ApiService.call('/user/chapter-rules');
                if (rulesResponse.data) {
                    const rulesDecrypted = Utils.decrypt(rulesResponse.data, currentUser.password);
                    if (rulesDecrypted) {
                        userRules = JSON.parse(rulesDecrypted);
                    } else {
                        // 解密失败时使用默认规则
                        userRules = userRulesDefault;
                        // 保存默认规则到服务器
                        await this.saveChapterRules();
                    }
                } else {
                    // 没有规则数据时使用默认规则
                    userRules = userRulesDefault;
                    // 保存默认规则到服务器
                    await this.saveChapterRules();
                }
            } catch (error) {
                console.error('加载章节规则失败:', error);
                // 错误时使用默认规则
                userRules = userRulesDefault;
                // 保存默认规则到服务器
                await this.saveChapterRules();
            }

            applyUserSettings();
            await CacheManager.set('user_settings', {
                settings: userSettings,
                userRules: userRules
            }, 60 * 60 * 1000);

            return true;
        } catch (error) {
            console.error('加载用户设置失败', error);
            // 出错时确保使用默认章节规则
            userRules = userRulesDefault;
            return false;
        }
    },

    async saveSettings() {
        if (!currentUser) return false;

        try {
            const settingsEncrypted = Utils.encrypt(JSON.stringify(userSettings), currentUser.password);
            await ApiService.call('/user/settings', 'PUT', { settings_data: settingsEncrypted });

            const cachedData = await CacheManager.get('user_settings') || {};
            cachedData.settings = userSettings;
            await CacheManager.set('user_settings', cachedData, 60 * 60 * 1000);

            return true;
        } catch (error) {
            console.error('保存设置失败:', error);
            return false;
        }
    },

    async saveChapterRules() {
        if (!currentUser) return false;

        try {
            const rulesEncrypted = Utils.encrypt(JSON.stringify(userRules), currentUser.password);
            await ApiService.call('/user/chapter-rules', 'PUT', { data: rulesEncrypted });

            const cachedData = await CacheManager.get('user_settings') || {};
            cachedData.userRules = userRules;
            await CacheManager.set('user_settings', cachedData, 60 * 1000);

            return true;
        } catch (error) {
            console.error('保存章节规则失败:', error);
            return false;
        }
    },

    async getChapterRules() {
        if (!currentUser) return userRulesDefault;

        try {
            const cachedRules = await CacheManager.get('chapter_rules');
            if (cachedRules) return cachedRules;

            const response = await ApiService.call('/user/chapter-rules');
            if (response && response.data) {
                const rulesDecrypted = Utils.decrypt(response.data, currentUser.password);
                const rules = rulesDecrypted ? JSON.parse(rulesDecrypted) : userRulesDefault;
                await CacheManager.set('chapter_rules', rules, 60 * 1000);
                return rules;
            }

            return userRulesDefault;
        } catch (error) {
            console.error('获取章节规则失败', error);
            return userRulesDefault;
        }
    },

    async deleteAccount(password) {
        if (!currentUser) return false;

        try {
            const passwordHash = CryptoJS.SHA256(password).toString();

            // 发送账号删除请求
            showLoading('正在删除账号');

            const response = await ApiService.call('/auth/delete-account', 'POST', {
                password_hash: passwordHash
            });

            // 清除用户数据
            this.clearAppData();

            snackbar.success('账号已成功删除');

            return true;
        } catch (error) {
            hideLoading();
            console.error('删除账号失败:', error);
            throw error;
        }
    },

    async syncUserData() {
        if (!currentUser) return false;

        showLoading('正在同步数据');

        try {
            // 调用自己的函数，保存用户设置和章节规则
            await this.saveSettings();
            await this.saveChapterRules();

            hideLoading();
            snackbar.success('数据同步成功');
            return true;

        } catch (error) {
            hideLoading();
            snackbar.error('数据同步失败：' + (error.message || '未知错误'));
            return false;
        }
    },

    async checkRegistrationAllowed() {
        try {
            const response = await ApiService.call('/system/settings');
            const settings = response.settings || [];
            const allowRegistration = settings.find(s => s.key === 'allow_registration');
            return allowRegistration ? allowRegistration.value === 'true' : true;
        } catch (error) {
            console.error('检查注册状态失败:', error);
            return true;
        }
    },

    logout() {
        ApiService.call('/auth/logout', 'POST').catch(e => console.error('登出失败', e));

        /* 登出清理 */
        this.clearAppData();

        showPage('login');
    },

    async clearAppData() {
        this.clearSession();
        await CacheManager.clear();
        currentUser = null;
        pageScrollPositions = {};
        userSettings = { ...userSettingsDefault };
        userRules = {};
        applyUserSettings();
    }
};

// 书籍管理
const BookManager = {
    async getBooks(folder = "") {
        if (!currentUser) return { books: [], total: 0, hasMore: false };

        try {
            let endpoint = '/books';
            if (folder) {
                if (folder === "uncategorized") {
                    endpoint += '?folder=';
                } else {
                    endpoint += `?folder=${encodeURIComponent(folder)}`;
                }
            }

            // 简化缓存键，只基于文件夹
            const cacheKey = `book_list_${folder}`;
            const cachedBooks = await CacheManager.get(cacheKey);
            if (cachedBooks) return cachedBooks;

            const response = await ApiService.call(endpoint);
            const decryptedBooks = response.books.map(book => {
                try {
                    const decryptedTitle = Utils.decrypt(book.title, currentUser.password);
                    const decryptedAuthor = book.author ? Utils.decrypt(book.author, currentUser.password) : '';

                    return {
                        ...book,
                        title: decryptedTitle,
                        author: decryptedAuthor,
                        folder_path: book.folder_path || '',
                        cover_url: book.cover_url || ''
                    };
                } catch (e) {
                    console.error('解密书籍信息失败', e);
                    return book;
                }
            });

            const result = {
                books: decryptedBooks,
                total: decryptedBooks.length,
                hasMore: false
            };

            await CacheManager.set(cacheKey, result, 60 * 60 * 1000);
            return result;
        } catch (error) {
            console.error('获取书籍列表失败', error);
            return { books: [], total: 0, hasMore: false };
        }
    },

    async getBookInfo(bookId) {
        if (!currentUser || !bookId) return null;

        try {
            const cacheKey = `book_info_${bookId}`;
            const cachedInfo = await CacheManager.get(cacheKey);
            if (cachedInfo) return cachedInfo;

            const response = await ApiService.call(`/books/${bookId}/info`);
            if (!response.book) return null;

            const bookData = response.book;
            const decryptedTitle = Utils.decrypt(bookData.title, currentUser.password);
            const decryptedAuthor = bookData.author ? Utils.decrypt(bookData.author, currentUser.password) : '';

            const bookInfo = {
                id: bookData.id,
                title: decryptedTitle || '无标题',
                author: decryptedAuthor,
                lastReadChapter: bookData.last_read_chapter || 0,
                lastReadPosition: bookData.last_read_position || 0,
                lastReadTime: bookData.last_read_time || null,
                chapterCount: bookData.chapter_count || 0,
                chapters: bookData.chapters || [],
                folder_path: bookData.folder_path || '',
                cover_url: bookData.cover_url || ''
            };

            // 使用定义的6个月TTL
            const CACHE_TTL_SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000;
            await CacheManager.set(cacheKey, bookInfo, CACHE_TTL_SIX_MONTHS);
            return bookInfo;
        } catch (error) {
            console.error('获取书籍信息失败:', error);
            return null;
        }
    },

    async getChapter(bookId, chapterIndex) {
        if (!currentUser || !bookId) return null;
        try {
            const cacheKey = `chapter_${bookId}_${chapterIndex}`;
            const cachedChapter = await CacheManager.get(cacheKey);
            if (cachedChapter) return cachedChapter;
            const response = await ApiService.call(`/books/${bookId}/chapters/${chapterIndex}`);
            if (!response.chapter) {
                throw new Error('章节不存在');
            }
            // 使用定义的6个月TTL
            const CACHE_TTL_SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000;
            await CacheManager.set(cacheKey, response.chapter, CACHE_TTL_SIX_MONTHS);
            return response.chapter;
        } catch (error) {
            console.error(`获取章节失败: ${bookId}-${chapterIndex}`, error);
            return null;
        }
    },

    // 检查章节是否已缓存
    async isChapterCached(bookId, chapterIndex) {
        if (!currentUser || !bookId) return false;
        const cacheKey = `chapter_${bookId}_${chapterIndex}`;
        return await CacheManager.get(cacheKey) !== null;
    },

    // 预缓存下一章节
    async preCacheNextChapters(bookId, currentChapterIndex, totalChapters, maxCacheCount = 3) {
        if (!currentUser || !bookId || totalChapters <= 1) return;

        console.log(`开始预缓存章节: 当前章节 ${currentChapterIndex}, 总章节 ${totalChapters}`);

        let cacheCount = 0;
        let nextIndex = (currentChapterIndex + 1) % totalChapters;
        let checkedChapters = new Set(); // 用来避免重复尝试同一个章节

        while (cacheCount < maxCacheCount && checkedChapters.size < totalChapters - 1) {
            // 跳过当前章节
            if (nextIndex === currentChapterIndex) {
                nextIndex = (nextIndex + 1) % totalChapters;
                continue;
            }

            if (!checkedChapters.has(nextIndex)) {
                checkedChapters.add(nextIndex);

                if (!await this.isChapterCached(bookId, nextIndex)) {
                    console.log(`预缓存章节 ${nextIndex}`);
                    try {
                        await this.getChapter(bookId, nextIndex);
                        console.log(`章节 ${nextIndex} 缓存成功`);
                        cacheCount++;
                    } catch (err) {
                        console.error(`章节 ${nextIndex} 缓存失败:`, err);
                    }
                } else {
                    console.log(`章节 ${nextIndex} 已缓存，跳过`);
                }
            }

            nextIndex = (nextIndex + 1) % totalChapters;
        }

    },

    async saveBook(title, author, txtContent, folder = "", isFavorite = false) {
        if (!currentUser) return null;

        try {
            // 解析章节
            const rules = await UserManager.getChapterRules();
            const chapters = ChapterProcessor.parseChapters(txtContent, rules);

            if (chapters.length === 0) {
                chapters.push({
                    title: title,
                    content: txtContent
                });
            }

            // 计算文件大小并加密章节
            let totalBookSize = 0;
            const encoder = new TextEncoder();

            const encryptedChapters = chapters.map(chapter => {
                const encryptedTitle = Utils.encrypt(chapter.title, currentUser.password);
                const encryptedContent = Utils.encrypt(chapter.content, currentUser.password);
                totalBookSize += encoder.encode(encryptedContent).length;

                return {
                    title: encryptedTitle,
                    content: encryptedContent
                };
            });

            // 一次性创建书籍并上传所有章节
            const response = await ApiService.call('/books/create', 'POST', {
                title: Utils.encrypt(title, currentUser.password),
                author: Utils.encrypt(author || '', currentUser.password),
                chapters: encryptedChapters,
                folder_path: folder,
                file_size: totalBookSize
            });

            if (!response.success) {
                throw new Error(`创建失败: ${response.message || '未知错误'}`);
            }

            // 处理收藏
            if (isFavorite) {
                if (!userSettings.favorites) {
                    userSettings.favorites = [];
                }
                if (!userSettings.favorites.includes(response.book_id)) {
                    userSettings.favorites.push(response.book_id);
                }
                await UserManager.saveSettings();
            }

            CacheManager.clearWithPrefix('book_list');

            return {
                id: response.book_id,
                title,
                author: author || '',
                lastReadChapter: 0,
                lastReadPosition: 0,
                chapterCount: chapters.length,
                lastReadTime: new Date().toISOString(),
                folder_path: folder
            };
        } catch (error) {
            console.error('保存书籍失败:', error);
            throw error;
        }
    },

    async updateBookInfo(bookId, title, author, folder = "", coverUrl = "", isFavorite = null) {
        if (!currentUser || !bookId) return false;

        try {
            const encryptedTitle = Utils.encrypt(title, currentUser.password);
            const encryptedAuthor = Utils.encrypt(author || '', currentUser.password);

            const updateData = {
                title: encryptedTitle,
                author: encryptedAuthor
            };

            if (folder !== undefined) {
                updateData.folder_path = folder;
            }

            if (coverUrl !== undefined) {
                updateData.cover_url = coverUrl;
            }

            await ApiService.call(`/books/${bookId}/update`, 'PUT', updateData);

            // 如果指定了收藏状态则更新
            if (isFavorite !== null) {
                if (!userSettings.favorites) {
                    userSettings.favorites = [];
                }

                const isCurrentlyFavorited = userSettings.favorites.includes(bookId);

                if (isCurrentlyFavorited !== isFavorite) {
                    if (isFavorite) {
                        userSettings.favorites.push(bookId);
                    } else {
                        const index = userSettings.favorites.indexOf(bookId);
                        if (index !== -1) {
                            userSettings.favorites.splice(index, 1);
                        }
                    }
                    await UserManager.saveSettings();
                }
            }

            await CacheManager.clearWithPrefix('book_list');
            await CacheManager.remove(`book_info_${bookId}`);

            return true;
        } catch (error) {
            console.error('更新书籍信息失败:', error);
            throw error;
        }
    },

    async updateBookProgress(bookId, chapterIndex, position = 0) {
        if (!currentUser || !bookId) return;

        try {
            await ApiService.call(`/books/${bookId}/progress`, 'PUT', {
                chapter_index: chapterIndex,
                position: position
            });

            const bookInfo = await CacheManager.get(`book_info_${bookId}`);
            if (bookInfo) {
                bookInfo.lastReadChapter = chapterIndex;
                bookInfo.lastReadPosition = position;
                bookInfo.lastReadTime = new Date().toISOString();
                // 使用定义的6个月TTL
                const CACHE_TTL_SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000;
                await CacheManager.set(`book_info_${bookId}`, bookInfo, CACHE_TTL_SIX_MONTHS);
            }

            // 添加到最近阅读列表
            Utils.addToRecentBooks(bookId);
        } catch (error) {
            console.error('更新阅读进度失败:', error);
        }
    },

    async deleteBook(bookId) {
        if (!currentUser || !bookId) throw new Error('参数无效');

        try {
            await ApiService.call(`/books/${bookId}`, 'DELETE');

            // 从收藏夹中移除
            if (userSettings.favorites && userSettings.favorites.includes(bookId)) {
                userSettings.favorites = userSettings.favorites.filter(id => id !== bookId);
                await UserManager.saveSettings();
            }

            // 从最近阅读中移除
            if (userSettings.recentBooks && userSettings.recentBooks.includes(bookId)) {
                userSettings.recentBooks = userSettings.recentBooks.filter(id => id !== bookId);
                await UserManager.saveSettings();
            }

            // 清除书籍相关的所有缓存
            // 1. 清除书籍信息缓存
            await CacheManager.remove(`book_info_${bookId}`);

            // 2. 清除所有章节缓存
            const bookInfo = await CacheManager.get(`book_info_${bookId}`);
            if (bookInfo) {
                const chapterCount = bookInfo.chapterCount || 0;
                for (let i = 0; i < chapterCount; i++) {
                    await CacheManager.remove(`chapter_${bookId}_${i}`);
                }
            } else {
                // 如果没有书籍信息缓存，尝试清除可能的章节缓存
                // 假设最多1000章，这是一个安全的上限
                for (let i = 0; i < 10000; i++) {
                    const cacheKey = `chapter_${bookId}_${i}`;
                    if (await CacheManager.get(cacheKey) === null) {
                        // 如果连续5个章节都没有缓存，则假设没有更多章节
                        if (i > 0 && i % 5 === 0 &&
                            await CacheManager.get(`chapter_${bookId}_${i - 1}`) === null &&
                            await CacheManager.get(`chapter_${bookId}_${i - 2}`) === null &&
                            await CacheManager.get(`chapter_${bookId}_${i - 3}`) === null &&
                            await CacheManager.get(`chapter_${bookId}_${i - 4}`) === null) {
                            break;
                        }
                    } else {
                        await CacheManager.remove(cacheKey);
                    }
                }
            }

            // 3. 清除书籍列表缓存
            await CacheManager.clearWithPrefix('book_list');
            console.log(`已清除书籍 ${bookId} 的所有章节缓存`);

            return true;
        } catch (error) {
            console.error('删除书籍失败:', error);
            throw error;
        }
    },

    async getFolders() {
        if (!currentUser) return { folders: [], uncategorized: 0 };

        try {
            const cacheKey = 'book_folders';
            const cachedFolders = await CacheManager.get(cacheKey);
            if (cachedFolders) return cachedFolders;

            const response = await ApiService.call('/books/folders');
            if (response && response.folders) {
                const folders = response.folders;
                const uncategorized = response.uncategorized || 0;
                await CacheManager.set(cacheKey, { folders, uncategorized }, 60 * 1000);
                return { folders, uncategorized };
            }

            return { folders: [], uncategorized: 0 };
        } catch (error) {
            console.error('获取文件夹列表失败:', error);
            return { folders: [], uncategorized: 0 };
        }
    },

    async deleteFolder(path) {
        if (!currentUser || !path) return false;

        try {
            showLoading('准备删除文件夹...');

            const emptyFolderResponse = await ApiService.call('/folders/delete', 'POST', {
                path: path,
                force_delete: true,
                empty_folder: true
            });

            if (emptyFolderResponse.success && emptyFolderResponse.complete) {
                hideLoading();
                await CacheManager.clearWithPrefix('book_folders');
                await CacheManager.clearWithPrefix('book_list');

                return {
                    success: true,
                    message: '删除成功'
                };
            }

            hideLoading();
            await CacheManager.clearWithPrefix('book_folders');
            await CacheManager.clearWithPrefix('book_list');

            return {
                success: true,
                message: `文件夹删除成功`
            };

        } catch (error) {
            hideLoading();
            console.error('删除文件夹失败:', error);
            throw error;
        }
    },

    async createFolder(path) {
        if (!currentUser || !path) return false;

        try {
            await ApiService.call('/folders/create', 'POST', { path });
            await CacheManager.clearWithPrefix('book_folders');
            return true;
        } catch (error) {
            console.error('创建文件夹失败:', error);
            throw error;
        }
    },

    async moveBook(bookId, folder) {
        if (!currentUser || !bookId) return false;

        try {
            const bookInfo = await this.getBookInfo(bookId);
            if (!bookInfo) {
                throw new Error('获取书籍信息失败');
            }

            await this.updateBookInfo(bookId, bookInfo.title, bookInfo.author, folder, bookInfo.cover_url);
            await CacheManager.clearWithPrefix('book_list');
            await CacheManager.clearWithPrefix('book_folders');

            return true;
        } catch (error) {
            console.error('移动书籍失败:', error);
            throw error;
        }
    },

    // 改进批处理函数，支持大批量操作和并发处理
    async batchProcessBooks(action, bookIds, folder = null) {
        if (!currentUser) return false;

        try {
            showLoading(action === 'delete' ? '删除中...' : '移动中...');

            // 确定批处理大小
            const batchSize = 50; // 每批处理50本书
            const concurrency = 3; // 最大并发请求数

            // 创建批处理函数
            const processBatch = async (batch, startIndex, total) => {
                try {
                    // 更新加载提示
                    showLoading(`${action === 'delete' ? '删除中...' : '移动中...'} (${startIndex + batch.length}/${total})`);

                    await ApiService.call('/books/batch', 'POST', {
                        action: action,
                        bookIds: batch,
                        folder_path: folder
                    });

                    // 如果是删除操作，更新收藏和最近阅读列表
                    if (action === 'delete') {
                        for (const bookId of batch) {
                            // 从收藏中移除
                            if (userSettings.favorites && userSettings.favorites.includes(bookId)) {
                                const index = userSettings.favorites.indexOf(bookId);
                                if (index !== -1) {
                                    userSettings.favorites.splice(index, 1);
                                }
                            }

                            // 从最近阅读中移除
                            if (userSettings.recentBooks && userSettings.recentBooks.includes(bookId)) {
                                const index = userSettings.recentBooks.indexOf(bookId);
                                if (index !== -1) {
                                    userSettings.recentBooks.splice(index, 1);
                                }
                            }

                            // 清除相关缓存
                            await CacheManager.remove(`book_info_${bookId}`);
                            await CacheManager.clearWithPrefix(`chapter_${bookId}_`);
                        }
                    }

                    return {
                        success: true,
                        count: batch.length
                    };
                } catch (error) {
                    console.error(`批量处理失败 (${startIndex}-${startIndex + batch.length})`, error);
                    return {
                        success: false,
                        error: error.message,
                        count: 0
                    };
                }
            };

            // 使用批处理工具函数处理所有书籍
            const result = await Utils.processBatch(bookIds, processBatch, batchSize, concurrency);

            // 保存更新后的用户设置
            if (action === 'delete') {
                await UserManager.saveSettings();
            }

            // 清除缓存
            await CacheManager.clearWithPrefix('book_list');
            await CacheManager.clearWithPrefix('book_folders');

            hideLoading();
            return true;
        } catch (error) {
            hideLoading();
            console.error(`批量${action === 'delete' ? '删除' : '移动'}失败:`, error);
            throw error;
        }
    },

    // 添加搜索函数
    async searchBooks(query, folder = "") {
        // 获取完整书籍列表
        const result = await this.getBooks(folder);

        if (!query.trim()) {
            return { books: [], total: 0, hasMore: false };
        }

        // 分解搜索词为关键字
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

        // 搜索匹配
        const matchedBooks = result.books.filter(book => {
            const title = (book.title || '').toLowerCase();
            const author = (book.author || '').toLowerCase();
            const folderPath = (book.folder_path || '').toLowerCase();

            // 检查是否所有关键字都至少匹配一个字段
            return keywords.every(keyword =>
                title.includes(keyword) ||
                author.includes(keyword) ||
                folderPath.includes(keyword)
            );
        });

        return {
            books: matchedBooks,
            total: matchedBooks.length,
            hasMore: false
        };
    }

};

// 锁定应用变量和函数
let inactivityTimer;
let currentPassword = '';

// 设置锁定密码
function setLockPassword() {
    const modalId = 'setLockPasswordModal';
    const modalContent = `
        <form>
            <mdui-text-field id="lockPasswordInput" variant="outlined" label="请输入 4 位数字密码" type="password" maxlength="4" pattern="[0-9]*" inputmode="numeric" toggle-password></mdui-text-field>
            <mdui-text-field id="lockPasswordConfirmInput" variant="outlined" label="请再次输入密码确认" type="password" maxlength="4" pattern="[0-9]*" inputmode="numeric" toggle-password></mdui-text-field>
        </form>
    `;

    let modal = ModalManager.modals[modalId];

    if (!modal) {
        modal = ModalManager.createModal(modalId, '设置锁定密码', modalContent);
    } else {
        modal.querySelector('.modal-body').innerHTML = modalContent;
    }

    ModalManager.show(modalId, {
        confirm: async () => {
            const passwordInput = document.getElementById('lockPasswordInput');
            const passwordConfirmInput = document.getElementById('lockPasswordConfirmInput');

            const password = passwordInput.value;
            const passwordConfirm = passwordConfirmInput.value;

            if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
                snackbar.error('请输入4位数字密码');
                return false;
            }

            if (password !== passwordConfirm) {
                snackbar.error('两次输入的密码不一致');
                return false;
            }

            // 加密密码后保存
            userSettings.lockPassword = password;

            // 如果锁定功能已启用，初始化不活动计时器
            if (userSettings.lockApp) {
                initInactivityTimer();
            }

            // 保存设置
            await UserManager.saveSettings();
            snackbar.info('锁定密码设置成功');

            // 关闭对话框
            ModalManager.hide(modalId);
            return true;
        }
    });
}

// 初始化锁屏数字键盘
function initLockScreenNumpad() {
    const numpadButtons = document.querySelectorAll('#lockScreen .numpad-button');
    numpadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const value = button.getAttribute('data-value');

            if (value === 'clear') {
                // 清除最后一位
                if (currentPassword.length > 0) {
                    currentPassword = currentPassword.slice(0, -1);
                    updatePasswordDots();
                }
            } else if (value === 'enter') {
                // 验证密码
                if (currentPassword.length === 4) {
                    verifyPassword();
                }
            } else {
                // 添加数字
                if (currentPassword.length < 4) {
                    currentPassword += value;
                    updatePasswordDots();

                    // 如果输入了4位数字，自动验证
                    if (currentPassword.length === 4) {
                        setTimeout(() => {
                            verifyPassword();
                        }, 300);
                    }
                }
            }
        });
    });
}

// 初始化不活动计时器
function initInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    // 设置计时器
    resetInactivityTimer();

    // 添加用户活动事件监听器
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });

    // 添加页面可见性变化事件监听器
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && userSettings.lockApp && userSettings.lockPassword) {
            // 当页面不可见时锁定应用
            lockApp();
        }
    });

    // 添加浏览器即将卸载事件监听器
    window.addEventListener('beforeunload', () => {
        if (userSettings.lockApp && userSettings.lockPassword) {
            // 当浏览器即将卸载时锁定应用
            lockApp();
        }
    });

    // 添加浏览器冻结事件监听器
    window.addEventListener('freeze', () => {
        if (userSettings.lockApp && userSettings.lockPassword) {
            // 当浏览器冻结时锁定应用
            lockApp();
        }
    });
}

// 重置不活动计时器
function resetInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    if (userSettings.lockApp && userSettings.lockPassword) {
        const timeoutMs = userSettings.lockTimeout * 60 * 1000;
        inactivityTimer = setTimeout(() => {
            lockApp();
        }, timeoutMs);
    }
}

// 锁定应用
function lockApp() {

    // 暂停视频播放器（如果正在播放）
    const videoPlayer = document.getElementById('customVideoPlayer');
    if (videoPlayer && !videoPlayer.paused) {
        videoPlayer.pause();
    }

    // 暂停iframe中的视频（如果有）
    const iframePlayer = document.getElementById('iframePlayerFrame');
    if (iframePlayer && iframePlayer.src && iframePlayer.src !== 'about:blank') {
        try {
            // 尝试向iframe发送暂停消息
            iframePlayer.contentWindow.postMessage('pause', '*');
        } catch (e) {
            console.warn('无法暂停iframe中的视频:', e);
        }
    }

    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
        lockScreen.classList.add('active');
        // 重置密码输入
        currentPassword = '';
        updatePasswordDots();

        // 设置 iframe 源
        const disguiseFrame = document.getElementById('disguiseFrame');
        const standardLockScreen = document.getElementById('standardLockScreen');
        const disguiseLockScreen = document.getElementById('disguiseLockScreen');

        if (disguiseFrame && standardLockScreen && disguiseLockScreen) {
            if (userSettings.lockDisguiseMode === 'standard') {
                standardLockScreen.classList.remove('hidden');
                disguiseLockScreen.classList.add('hidden');
            } else {
                standardLockScreen.classList.add('hidden');
                disguiseLockScreen.classList.remove('hidden');

                // 设置 iframe 源
                switch (userSettings.lockDisguiseMode) {
                    case 'calculator':
                        disguiseFrame.src = './lock-calc.html';
                        break;
                    default:
                        disguiseFrame.src = '';
                        break;
                }
            }
        }
    }
}

// 解锁应用
function unlockApp() {

    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
        lockScreen.classList.remove('active');
        resetInactivityTimer();
    }
}

// 更新密码点显示
function updatePasswordDots() {
    const dots = document.querySelectorAll('#lockScreen .password-dot');
    dots.forEach((dot, index) => {
        if (index < currentPassword.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

// 验证密码
function verifyPassword() {
    if (currentPassword === userSettings.lockPassword) {
        unlockApp();
        return true;
    } else {
        // 密码错误，显示错误消息并清除输入
        const lockTitle = document.querySelector('#lockScreen .lock-title');
        const originalText = lockTitle.textContent;
        lockTitle.textContent = '密码错误，请重试';
        lockTitle.style.color = 'rgb(var(--mdui-color-error))';

        // 震动效果
        const passwordContainer = document.querySelector('#lockScreen .password-container');
        passwordContainer.style.animation = 'shake 0.5s';

        // 重置状态
        setTimeout(() => {
            lockTitle.textContent = originalText;
            lockTitle.style.color = '';
            passwordContainer.style.animation = '';
            currentPassword = '';
            updatePasswordDots();
        }, 1000);

        return false;
    }
}

// 应用用户设置
function applyUserSettings() {
    const bodyElement = document.documentElement;
    const prevTheme = bodyElement.className.match(/theme-\w+/)?.[0] || 'theme-default';
    const newTheme = `theme-${userSettings.colorTheme}`;

    document.documentElement.style.setProperty('--font-size', `${userSettings.fontSize}px`);
    document.documentElement.style.setProperty('--line-spacing', userSettings.lineSpacing);
    document.documentElement.style.setProperty('--first-line-indent', `${userSettings.firstLineIndent}em`);
    document.documentElement.style.setProperty('--font-family', userSettings.fontFamily);
    document.documentElement.style.setProperty('--letter-spacing', `${userSettings.letterSpacing}px`);
    document.documentElement.style.setProperty('--paragraph-spacing', `${userSettings.paragraphSpacing}em`);

    if (userSettings.primaryColor) {
        applyPrimaryColor(userSettings.primaryColor);
    }

    if (prevTheme !== newTheme) {
        document.documentElement.style.setProperty('--transition-speed', '0s');
        bodyElement.classList.remove(prevTheme);
        bodyElement.classList.add(newTheme);
        setTimeout(() => {
            document.documentElement.style.setProperty('--transition-speed', '0.3s');
        }, 50);
    }

    if (userSettings.darkMode) {
        document.documentElement.classList.add('mdui-theme-dark');
        if (document.getElementById('darkModeToggle')) {
            document.getElementById('darkModeToggle').checked = true;
        }
    } else {
        document.documentElement.classList.remove('mdui-theme-dark');
        if (document.getElementById('darkModeToggle')) {
            document.getElementById('darkModeToggle').checked = false;
        }
    }

    // 应用锁定应用设置
    if (document.getElementById('lockAppToggle')) {
        document.getElementById('lockAppToggle').checked = userSettings.lockApp;
    }

    // 应用锁定界面选择
    if (document.getElementById('lockDisguiseModeSelect')) {
        document.getElementById('lockDisguiseModeSelect').value = userSettings.lockDisguiseMode;
    }

    // 应用锁定超时设置
    if (document.getElementById('lockTimeoutSlider')) {
        document.getElementById('lockTimeoutSlider').value = userSettings.lockTimeout;
        document.getElementById('lockTimeoutValue').textContent = `${userSettings.lockTimeout}分钟`;
    }

    // 如果启用了锁定应用，初始化不活动计时器
    if (userSettings.lockApp && userSettings.lockPassword) {
        initInactivityTimer();
    }

    // 如果设置UI可见，更新UI
    updateSettingsUI();
}

// 更新设置UI
function updateSettingsUI() {
    const fontSizeEl = document.getElementById('fontSize');
    const fontSizeValueEl = document.getElementById('fontSizeValue');
    const lineSpacingEl = document.getElementById('lineSpacing');
    const lineSpacingValueEl = document.getElementById('lineSpacingValue');
    const firstLineIndentEl = document.getElementById('firstLineIndent');
    const firstLineIndentValueEl = document.getElementById('firstLineIndentValue');
    const paragraphSpacingEl = document.getElementById('paragraphSpacing');
    const paragraphSpacingValueEl = document.getElementById('paragraphSpacingValue');
    const fontFamilyEl = document.getElementById('fontFamily');

    if (fontSizeEl && fontSizeValueEl) {
        fontSizeEl.value = userSettings.fontSize;
        fontSizeValueEl.textContent = `${userSettings.fontSize}px`;
    }

    if (lineSpacingEl && lineSpacingValueEl) {
        lineSpacingEl.value = userSettings.lineSpacing;
        lineSpacingValueEl.textContent = userSettings.lineSpacing;
    }

    if (firstLineIndentEl && firstLineIndentValueEl) {
        firstLineIndentEl.value = userSettings.firstLineIndent;
        firstLineIndentValueEl.textContent = `${userSettings.firstLineIndent}em`;
    }

    if (paragraphSpacingEl && paragraphSpacingValueEl) {
        paragraphSpacingEl.value = userSettings.paragraphSpacing;
        paragraphSpacingValueEl.textContent = `${userSettings.paragraphSpacing}em`;
    }

    if (fontFamilyEl) {
        fontFamilyEl.value = userSettings.fontFamily;
    }

    // 更新主题选择
    const colorThemeEls = document.querySelectorAll('.color-theme');
    colorThemeEls.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-theme') === userSettings.colorTheme) {
            item.classList.add('active');
        }
    });

    // 更新主色调
    const colorOptionEls = document.querySelectorAll('.color-option');
    colorOptionEls.forEach(option => {
        option.classList.remove('active');
        if (option.dataset.color === userSettings.primaryColor) {
            option.classList.add('active');
        }
    });
}

// 应用主色调
function applyPrimaryColor(color) {

    mdui.setColorScheme(color);

    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.classList.remove('active');
        if (option.dataset.color === color) {
            option.classList.add('active');
        }
    });

    userSettings.primaryColor = color;
}

// 切换收藏状态
async function toggleFavorite(bookId) {
    if (!userSettings.favorites) {
        userSettings.favorites = [];
    }

    const index = userSettings.favorites.indexOf(bookId);
    const isFavorite = index === -1;

    if (isFavorite) {
        userSettings.favorites.push(bookId);
        snackbar.success('已添加到收藏');
    } else {
        userSettings.favorites.splice(index, 1);
        snackbar.success('已从收藏中移除');
    }

    await UserManager.saveSettings();

    if (currentFilter === 'favorites' && !isFavorite) {
        refreshLibrary();
    }

    return isFavorite;
}

// 显示加载指示器
function showLoading(message = '处理中...') {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingOverlay').classList.remove('hidden');
    document.documentElement.classList.add('loading');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('importProgress').classList.add('hidden');
    document.documentElement.classList.remove('loading');
}

// 显示导入进度
function showImportProgress() {
    document.getElementById('importProgress').classList.remove('hidden');
}

function updateImportProgress(current, total, percent) {
    document.getElementById('loadingOverlay').classList.remove('hidden');
    document.getElementById('importProgress').classList.remove('hidden');
    document.getElementById('importProgressBar').value = current;
    document.getElementById('importProgressBar').max = total;
    document.getElementById('importProgressText').textContent = `已处理: ${current} / ${total}`;
}

// 页面导航
function showPage(pageId, updateHash = true) {

    // 保存当前页面的滚动位置
    if (pageHistory.length > 0) {
        const currentPageId = pageHistory[pageHistory.length - 1];
        // 确保是有效的页面ID
        if (currentPageId && document.getElementById(currentPageId + 'Page')) {
            // 保存滚动位置
            pageScrollPositions[currentPageId] = document.documentElement.scrollTop;
        }
    }

    //.bottom-nav 获取这个.bottom-nav
    const bottomNav = document.querySelector('.bottom-nav');

    // 遍历.bottom-nav下的所有选项
    const bottomNavOptions = bottomNav.querySelectorAll('mdui-navigation-bar-item');
    bottomNavOptions.forEach(option => {
        option.active = false;
        if (option.value === pageId) {
            option.active = true;
        }
    });

    // 添加到历史记录
    pageHistory.push(pageId);

    // 更新URL，记录当前书籍和章节或文件夹
    if (updateHash) {
        let newHash = `#${pageId}`;

        // 针对特定页面添加额外参数
        if (pageId === 'reader' && currentBook) {
            newHash = `#reader/${currentBook.id}/${currentChapter}`;
        } else if (pageId === 'library' && currentFolder) {
            newHash = `#library/${encodeURIComponent(currentFolder)}`;
        } else if (pageId === 'folders') {
            newHash = `#folders`;
        } else if (pageId !== 'reader' && pageId !== 'readerChapters' && pageId !== 'readerSettings') {
            newHash = `#${pageId}`;
        }

        if (window.location.hash !== newHash) {
            history.pushState(null, null, newHash);
        }
    }

    // 隐藏所有页面
    const pages = document.querySelectorAll('[id$="Page"]');
    pages.forEach(page => {
        page.classList.remove('page-visible');
        page.classList.add('page-hidden');
    });

    const overlay = document.getElementById('loadingOverlay');
    const root = document.documentElement;

    // 如果页面是reader、readerChapters、readerSettings，则设置html背景色为 var(--bg-color) ，反之设置为 var(--mdui-color-background)
    if (['reader', 'readerChapters', 'readerSettings'].includes(pageId)) {
        root.style.background = 'var(--bg-color)';
        overlay.style = '--overlay-bg-color: var(--bg-color)';
        bottomNav.classList.add('hidden');

    } else if (pageId === 'videoPlayer' || pageId === 'iframePlayer') {
        root.style.background = '#000000';
        overlay.style = '--overlay-bg-color: #000000';
        bottomNav.classList.add('hidden');

    } else {
        root.style.background = 'rgb(var(--mdui-color-background))';
        overlay.style = '--overlay-bg-color: rgb(var(--mdui-color-background))';
        bottomNav.classList.remove('hidden');
    }

    // 如果当前页面是 reader，则设置 html 的类为 reader-open
    if (pageId === 'reader') {
        document.documentElement.classList.add('reader-open');
    } else {
        document.documentElement.classList.remove('reader-open');
    }

    // 显示请求的页面
    const page = document.getElementById(pageId + 'Page');

    if (page) {
        page.classList.remove('page-hidden');
        page.classList.add('page-visible');

        // 处理底部导航
        const bottomNavEl = document.getElementById('bottomNav');

        // 为某些页面重置滚动位置
        if (['login', 'register', 'profile', 'videoplayer'].includes(pageId)) {
            document.documentElement.scrollTop = 0;
        }

        // 加载页面内容
        if (pageId === 'library') {
            refreshLibrary(pageScrollPositions[pageId]);
        } else if (pageId === 'folders') {
            refreshFolders();
            // 这里为folders页面保留滚动恢复，因为没有异步加载过程
            if (pageScrollPositions[pageId] !== undefined) {
                setTimeout(() => {
                    document.documentElement.scrollTop = pageScrollPositions[pageId];
                }, 10);
            }
        } else if (pageId === 'settings') {
            loadProfileData();

            // 为settings恢复滚动位置
            if (pageScrollPositions[pageId] !== undefined) {
                setTimeout(() => {
                    document.documentElement.scrollTop = pageScrollPositions[pageId];
                }, 10);
            }
        } else if (pageId === 'chapterRules') {
            refreshChapterRules();

            // 为chapterRules恢复滚动位置
            if (pageScrollPositions[pageId] !== undefined) {
                setTimeout(() => {
                    document.documentElement.scrollTop = pageScrollPositions[pageId];
                }, 10);
            }
        } else if (pageId === 'login') {
            if (userSettings.primaryColor) {
                applyPrimaryColor(userSettings.primaryColor);
            }
        } else if (pageId === 'register') {
            if (userSettings.primaryColor) {
                applyPrimaryColor(userSettings.primaryColor);
            }
        } else if (pageId === 'admin') {
            loadAdminData();
            // 为admin恢复滚动位置
            if (pageScrollPositions[pageId] !== undefined) {
                setTimeout(() => {
                    document.documentElement.scrollTop = pageScrollPositions[pageId];
                }, 10);
            }
        } else if (pageId === 'video') { // 添加对 videoPage 的处理
            loadVideoPageData();
            // 为 videoPage 恢复滚动位置 (如果需要)
            if (pageScrollPositions[pageId] !== undefined) {
                setTimeout(() => {
                    document.documentElement.scrollTop = pageScrollPositions[pageId];
                }, 10);
            }
        } else if (pageScrollPositions[pageId] !== undefined) {
            // 为其他页面恢复滚动位置
            setTimeout(() => {
                document.documentElement.scrollTop = pageScrollPositions[pageId];
            }, 10);
        }
    }
}

// 刷新书库
async function refreshLibrary(scrollPosition) {
    console.log('刷新书库，需要恢复的滚动位置:', scrollPosition);
    // 根据当前模式选择视图
    const gridView = document.getElementById('bookGridView');
    const listView = document.getElementById('bookListView');
    const skeletonView = document.getElementById('bookListSkeleton');
    const emptyLibrary = document.getElementById('emptyLibrary');
    const paginationNav = document.getElementById('paginationNav');

    // 显示加载骨架屏
    gridView.classList.add('hidden');
    listView.classList.add('hidden');
    skeletonView.classList.remove('hidden');
    emptyLibrary.classList.add('hidden');
    paginationNav.classList.add('hidden');

    // 检查是否有保存的搜索查询
    const searchInput = document.getElementById('bookSearch');
    const currentQuery = searchInput.value.trim();

    try {
        let allBooks = [];

        // 获取完整书籍列表
        if (lastSearchQuery && (!currentQuery || currentQuery !== lastSearchQuery)) {
            // 恢复上次的搜索查询到搜索框
            searchInput.value = lastSearchQuery;
            const searchResult = await BookManager.searchBooks(lastSearchQuery, currentFolder);
            allBooks = searchResult.books;
        } else if (currentQuery) {
            // 如果当前已有查询，使用当前查询
            lastSearchQuery = currentQuery;
            const searchResult = await BookManager.searchBooks(currentQuery, currentFolder);
            allBooks = searchResult.books;
        } else {
            // 重置搜索状态
            lastSearchQuery = "";

            // 如果是未分类文件夹，先检查是否有书籍
            if (currentFolder === "uncategorized") {
                const folderInfo = await BookManager.getFolders();
                if (folderInfo.uncategorized === 0) {
                    // 如果未分类书籍为0，则显示空状态
                    skeletonView.classList.add('hidden');
                    emptyLibrary.classList.remove('hidden');
                    emptyLibrary.innerHTML = `<div class="empty-library-content">
                        <mdui-icon name="folder_off" class="empty-library-icon"></mdui-icon>
                        <p class="empty-library-text">文件夹中没有书籍</p>
                        <mdui-button id="emptyLibraryImportButton">导入书籍</mdui-button>
                    </div>`;

                    // 隐藏文件夹面包屑
                    document.getElementById('currentFolderInfo').classList.add('hidden');
                    return;
                }
            }

            const result = await BookManager.getBooks(currentFolder);
            allBooks = result.books;
        }

        // 前端应用筛选器
        let filteredBooks = allBooks;
        if (currentFilter === 'favorites') {
            filteredBooks = allBooks.filter(book => Utils.isBookFavorited(book.id));
        } else if (currentFilter === 'recent') {
            if (userSettings.recentBooks && userSettings.recentBooks.length > 0) {
                filteredBooks = allBooks.filter(book => userSettings.recentBooks.includes(book.id));
                filteredBooks.sort((a, b) => {
                    return userSettings.recentBooks.indexOf(a.id) - userSettings.recentBooks.indexOf(b.id);
                });
            } else {
                filteredBooks = allBooks.filter(book => book.last_read_time);
                filteredBooks.sort((a, b) => new Date(b.last_read_time) - new Date(a.last_read_time));
            }
        }

        // 前端分页处理
        const totalBooks = filteredBooks.length;
        const totalPages = Math.ceil(totalBooks / bookListPageSize);
        const startIdx = (bookListPage - 1) * bookListPageSize;
        const endIdx = startIdx + bookListPageSize;
        const paginatedBooks = filteredBooks.slice(startIdx, endIdx);
        const hasMore = endIdx < totalBooks;

        // 隐藏骨架屏
        skeletonView.classList.add('hidden');

        if (paginatedBooks.length === 0) {
            // 显示空状态
            emptyLibrary.classList.remove('hidden');
            if (lastSearchQuery) {
                emptyLibrary.innerHTML = `<div class="empty-library-content">
                    <mdui-icon name="search_off" class="empty-library-icon"></mdui-icon>
                    <p class="empty-library-text">没有找到匹配"${lastSearchQuery}"的结果</p>
                    <mdui-button id="emptyLibraryImportButton">导入书籍</mdui-button>
                </div>`;
            } else if (currentFolder) {
                emptyLibrary.innerHTML = `<div class="empty-library-content">
                    <mdui-icon name="folder_off" class="empty-library-icon"></mdui-icon>
                    <p class="empty-library-text">${currentFolder === "uncategorized" ? "未分类文件夹" : `"${currentFolder}"`}中没有书籍</p>
                </div>`;
            }
            return;
        }

        // 清除当前视图
        gridView.innerHTML = '';
        listView.innerHTML = '';

        // 渲染视图
        if (userSettings.viewMode === 'grid') {
            gridView.classList.remove('hidden');
            renderGridView(paginatedBooks, false);
        } else {
            listView.classList.remove('hidden');
            renderListView(paginatedBooks, false);
        }

        // 显示/隐藏分页导航
        if (totalPages > 1) {
            paginationNav.classList.remove('hidden');
            renderPagination(bookListPage, totalPages, totalBooks);
        } else {
            paginationNav.classList.add('hidden');
        }

        // 如果在文件夹中则更新文件夹面包屑
        if (currentFolder) {
            document.getElementById('currentFolderInfo').classList.remove('hidden');
            document.getElementById('currentFolderName').textContent = currentFolder === 'uncategorized' ? '未分类' : currentFolder;
        } else {
            document.getElementById('currentFolderInfo').classList.add('hidden');
        }

        // 如果启用了选择模式则初始化
        if (selectionMode) {
            enableSelectionMode();
        }

        // 在渲染视图后恢复滚动位置
        if (scrollPosition !== undefined) {
            // 确保在所有DOM操作完成后进行滚动
            setTimeout(() => {
                document.documentElement.scrollTop = scrollPosition;
                console.log('恢复滚动位置:', scrollPosition);
                OfflineManager.updateBookOfflineButtons();
            }, 10);
        }

    } catch (error) {
        skeletonView.classList.add('hidden');
        console.error('刷新书库失败:', error);
        snackbar.error('加载书籍失败: ' + (error.message || '未知错误'));
    }
}

// 渲染网格视图
function renderGridView(books, append = false) {
    const container = document.getElementById('bookGridView');

    if (!append) {
        container.innerHTML = '';
    }

    books.forEach(book => {
        const lastReadTime = book.last_read_time ? new Date(book.last_read_time) : null;
        const isRecent = lastReadTime && ((new Date() - lastReadTime) < 7 * 24 * 60 * 60 * 1000); // 7天
        const progress = book.chapter_count > 0 ? (book.last_read_chapter / book.chapter_count) * 100 : 0;
        const coverStyle = book.cover_url ? `background-image: url('${book.cover_url}');` : ``;
        const isFavorite = Utils.isBookFavorited(book.id);

        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.setAttribute('data-book-id', book.id);
        bookCard.setAttribute('data-title', book.title);
        bookCard.setAttribute('data-author', book.author);
        bookCard.setAttribute('data-folder', book.folder_path || '');

        bookCard.innerHTML = `
            ${(isFavorite || isRecent) ? `
            <div class="book-tag ${isFavorite ? 'tag-favorite' : 'tag-recent'}">
                ${isFavorite ? '<mdui-icon name="star--outlined"></mdui-icon>收藏' : '<mdui-icon name="history"></mdui-icon>最近'}
            </div>
            ` : ''}
            
            <div class="book-select-checkbox"></div>
            
            <div class="book-cover" style="${coverStyle}">
                <div class="book-progress" style="width: ${progress}%"></div>
                <div class="book-cover-overlay">
                    <h3 class="book-title">${book.title}</h3>
                    <div class="book-flex">
                        ${book.author != '' ? `<span class="book-author">${book.author}</span>` : `<span class="book-file-size">${Utils.formatFileSize(book.file_size)}</span>`}
                    </div>
                </div>
                <div class="book-actions">
                    <mdui-button-icon icon="edit" class="book-action-btn book-edit-btn"></mdui-button-icon>
                    <mdui-button-icon icon="open_in_new" class="book-action-btn book-open-new-btn"></mdui-button-icon>
                    <mdui-button-icon icon="${isFavorite ? 'star--outlined' : 'star'}" class="book-action-btn book-favorite-btn"></mdui-button-icon>
                        <mdui-button-icon icon="download" class="book-action-btn book-offline-btn" data-book-id="${book.id}"></mdui-button-icon>
                    <mdui-button-icon icon="delete" class="book-action-btn book-delete-btn"></mdui-button-icon>
                </div>
                </div>
            </div>
        `;

        container.appendChild(bookCard);

        // 添加事件监听器
        addBookCardListeners(bookCard, book);
    });
}

// 渲染列表视图
function renderListView(books, append = false) {
    const container = document.getElementById('bookListView');

    if (!append) {
        container.innerHTML = '';
    }

    books.forEach(book => {
        const lastReadTime = book.last_read_time ? new Date(book.last_read_time) : null;
        const isRecent = lastReadTime && ((new Date() - lastReadTime) < 7 * 24 * 60 * 60 * 1000); // 7天
        const progress = book.chapter_count > 0 ? (book.last_read_chapter / book.chapter_count) * 100 : 0;
        const coverStyle = book.cover_url ? `background-image: url('${book.cover_url}');` : ``;
        const isFavorite = Utils.isBookFavorited(book.id);

        const bookItem = document.createElement('div');
        bookItem.className = 'book-list-item';
        bookItem.setAttribute('data-book-id', book.id);
        bookItem.setAttribute('data-title', book.title);
        bookItem.setAttribute('data-author', book.author);
        bookItem.setAttribute('data-folder', book.folder_path || '');

        bookItem.innerHTML = `
            <div class="book-list-checkbox"></div>
            <div class="book-list-cover" style="${coverStyle}"></div>
            <div class="book-list-info">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="book-list-title">${book.title}</div>
                        <div class="book-list-author">${book.author}</div>
                    </div>
            ${(isFavorite || isRecent) ? `
            <div class="book-tag ${isFavorite ? 'tag-favorite' : 'tag-recent'}" style="zoom: 0.8">
                ${isFavorite ? '<mdui-icon name="star--outlined"></mdui-icon>收藏' : '<mdui-icon name="history"></mdui-icon>最近'}
            </div>
            ` : ''}
                </div>
                <div class="book-list-bottom">
                    <span>${book.last_read_chapter} / ${book.chapter_count}</span>
                    <span>${Utils.formatFileSize(book.file_size)}</span>
                    <span>${lastReadTime ? Utils.formatDate(lastReadTime) : '未读'}</span>
                    <mdui-dropdown class="book-list-actions">
                        <mdui-button-icon slot="trigger" icon="more_vert"></mdui-button-icon>
                        <mdui-menu>
                            <mdui-menu-item class="book-open-new-btn">
                                <mdui-icon slot="icon" name="open_in_new"></mdui-icon>
                                在新页面打开
                            </mdui-menu-item>
                            <mdui-menu-item class="book-edit-btn">
                                <mdui-icon slot="icon" name="edit"></mdui-icon>
                                编辑
                            </mdui-menu-item>
                            <mdui-menu-item class="book-favorite-btn">
                                <mdui-icon slot="icon" name="${isFavorite ? 'star--outlined' : 'star'}"></mdui-icon>
                                ${isFavorite ? '取消收藏' : '收藏'}
                            </mdui-menu-item>
                            <mdui-menu-item class="book-offline-btn" data-book-id="${book.id}">
                                <mdui-icon slot="icon" name="download"></mdui-icon>
                                缓存到本地
                            </mdui-menu-item>
                            <mdui-menu-item class="book-delete-btn">
                                <mdui-icon slot="icon" name="delete"></mdui-icon>
                                删除
                            </mdui-menu-item>
                        </mdui-menu>
                    </mdui-dropdown>
                </div>
        `;

        container.appendChild(bookItem);

        // 添加列表项事件监听器
        addBookCardListeners(bookItem, book);
    });
}

// 为书籍卡片添加事件监听器（网格视图）
function addBookCardListeners(bookCard, book) {
    // 点击打开书籍
    bookCard.addEventListener('click', (e) => {
        const isClickableElement = e.target.closest('.book-actions, .book-list-actions, mdui-button, mdui-button-icon, mdui-menu, mdui-menu-item, mdui-dropdown');
        if (selectionMode) {
            if (!isClickableElement) {
                toggleBookSelection(bookCard, book.id);
            }
        } else if (!isClickableElement) {
            openBook(book.id);
        }
    });

    // 操作按钮
    const editBtn = bookCard.querySelector('.book-edit-btn');
    const openNewBtn = bookCard.querySelector('.book-open-new-btn');
    const favoriteBtn = bookCard.querySelector('.book-favorite-btn');
    const deleteBtn = bookCard.querySelector('.book-delete-btn');
    const offlineBtn = bookCard.querySelector('.book-offline-btn');

    // 编辑书籍
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editBook(book.id);
    });

    // 在新页面打开
    openNewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}#reader/${book.id}/0`;
        window.open(url, '_blank');
    });

    // 切换收藏
    favoriteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isFav = Utils.isBookFavorited(book.id);
        const newState = await toggleFavorite(book.id);

        // 更新图标
        e.icon = newState ? 'star' : 'star_border';

        // 如果在收藏过滤器中并取消收藏，刷新
        if (isFav && !newState && currentFilter === 'favorites') {
            refreshLibrary();
        }
    });

    // 离线缓存按钮
    offlineBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (OfflineManager.isOffline) {
            snackbar.error('离线模式下无法进行缓存操作');
            return;
        }

        const isCached = await OfflineManager.isBookCached(book.id);

        if (isCached) {
            const confirmed = await ModalManager.confirm('确定要清除本地缓存吗？');
            if (confirmed) {
                await OfflineManager.removeCachedBook(book.id);
            }
        } else {
            // 显示进度条
            showImportProgress();
            await OfflineManager.cacheBookForOffline(book.id);
        }
    });


    // 删除书籍
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await ModalManager.danger(`确定要删除《${book.title}》吗？此操作不可恢复。`);

        if (confirmed) {
            try {
                showLoading('删除中...');
                await BookManager.deleteBook(book.id);
                hideLoading();
                snackbar.success('书籍已删除');
                refreshLibrary();
            } catch (error) {
                hideLoading();
                snackbar.error(error.message || '删除失败');
            }
        }
    });
}

// 为书籍列表项添加事件监听器
function addBookListItemListeners(bookItem, book) {
    // 点击打开书籍
    bookItem.addEventListener('click', (e) => {
        if (selectionMode) {
            toggleBookSelection(bookItem, book.id);
        } else {
            openBook(book.id);
        }
    });
}

// 切换书籍选择
function toggleBookSelection(element, bookId) {
    if (selectedBooks.has(bookId)) {
        selectedBooks.delete(bookId);
        element.classList.remove('selected');
    } else {
        selectedBooks.add(bookId);
        element.classList.add('selected');
    }

    // 更新UI
    document.getElementById('selectedCount').textContent = `已选择 ${selectedBooks.size} 项`;

    // 显示/隐藏批量工具栏
    const batchToolbar = document.getElementById('batchToolbar');
    if (selectedBooks.size > 0) {
        batchToolbar.classList.add('visible');
    } else {
        batchToolbar.classList.remove('visible');
    }
}

// 启用书籍选择模式
function enableSelectionMode() {
    selectionMode = true;
    document.getElementById('selectModeBtn').innerHTML = '取消';
    document.getElementById('selectModeBtn').icon = 'close';

    // 为所有书籍添加可选择类
    document.querySelectorAll('.book-card').forEach(card => {
        card.classList.add('selectable');
    });

    document.querySelectorAll('.book-list-item').forEach(item => {
        item.classList.add('selectable');
    });

    // 清除之前的选择
    selectedBooks.clear();
    document.querySelectorAll('.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // 隐藏批量工具栏
    document.getElementById('batchToolbar').classList.remove('visible');
    document.getElementById('selectedCount').textContent = '已选择 0 项';


}

// 禁用书籍选择模式
function disableSelectionMode() {
    selectionMode = false;
    document.getElementById('selectModeBtn').innerHTML = '多选';
    document.getElementById('selectModeBtn').icon = 'select_all';

    // 移除可选择类
    document.querySelectorAll('.book-card').forEach(card => {
        card.classList.remove('selectable', 'selected');
    });

    document.querySelectorAll('.book-list-item').forEach(item => {
        item.classList.remove('selectable', 'selected');
    });

    // 隐藏批量工具栏
    document.getElementById('batchToolbar').classList.remove('visible');

    // 清除选择
    selectedBooks.clear();
}

// 移动书籍到文件夹
async function moveBookToFolder(bookId) {
    try {
        // 获取文件夹列表
        const result = await BookManager.getFolders();
        const folders = result.folders || [];

        // 创建并显示对话框
        const modalId = 'moveBookModal';
        const modalContent = `
            <mdui-select label="选择目标文件夹" variant="outlined" icon="folder" id="moveBookFolder">
                <mdui-menu-item value="">根目录</mdui-menu-item>
                <mdui-button-icon slot="end-icon" id="newFolderForMoveBtn" icon="add"></mdui-button-icon>
            </mdui-select>
        `;

        let modal = ModalManager.modals[modalId];

        if (!modal) {
            modal = ModalManager.createModal(modalId, '移动书籍', modalContent);
        } else {
            modal.querySelector('.modal-body').innerHTML = modalContent;
        }

        // 加载文件夹
        const selectEl = document.getElementById('moveBookFolder');
        folders.forEach(folder => {
            const option = document.createElement('mdui-menu-item');
            option.value = folder.path;
            option.textContent = folder.path;
            selectEl.appendChild(option);
        });

        ModalManager.show(modalId);

        // 添加新建文件夹按钮事件
        document.getElementById('newFolderForMoveBtn').addEventListener('click', async () => {
            const folderName = await ModalManager.prompt('新建文件夹', '输入文件夹名称');
            if (folderName) {
                try {
                    await BookManager.createFolder(folderName);

                    // 更新文件夹选择
                    const option = document.createElement('mdui-menu-item');
                    option.value = folderName;
                    option.textContent = folderName;
                    option.selected = true;
                    selectEl.appendChild(option);

                    snackbar.success('文件夹已创建');
                } catch (error) {
                    snackbar.error(error.message || '创建文件夹失败');
                }
            }
        });

        // 添加确认按钮事件
        modal.querySelector('.modal-confirm').addEventListener('click', async () => {
            const selectedFolder = document.getElementById('moveBookFolder').value;

            if (typeof bookId === 'string') {
                // 单本书籍
                try {
                    showLoading('移动中...');
                    await BookManager.moveBook(bookId, selectedFolder);
                    hideLoading();
                    ModalManager.hide(modalId);
                    snackbar.success('书籍已移动');
                    refreshLibrary();
                } catch (error) {
                    hideLoading();
                    snackbar.error(error.message || '移动书籍失败');
                }
            } else if (Array.isArray(bookId)) {
                // 多本书籍
                try {
                    showLoading('批量移动中...');
                    await BookManager.batchProcessBooks('move', bookId, selectedFolder);
                    hideLoading();
                    ModalManager.hide(modalId);
                    snackbar.success(`已移动 ${bookId.length} 本书籍`);
                    refreshLibrary();
                } catch (error) {
                    hideLoading();
                    snackbar.error(error.message || '批量移动失败');
                }
            }
        });
    } catch (error) {
        console.error('移动书籍失败:', error);
        snackbar.error('加载文件夹失败');
    }
}

// 编辑书籍
async function editBook(bookId) {
    try {
        showLoading('加载书籍信息');
        const book = await BookManager.getBookInfo(bookId);

        if (!book) {
            hideLoading();
            snackbar.error('获取书籍信息失败');
            return;
        }

        // 创建编辑书籍对话框
        const modalId = 'editBookModal';
        const modalContent = `
            <form id="editBookForm">
                <input type="hidden" id="editBookId" value="${book.id}">
                <mdui-text-field variant="outlined" id="editBookTitle" class="form-input" value="${book.title}" label="书名"></mdui-text-field>
                <mdui-text-field variant="outlined" id="editBookAuthor" class="form-input" value="${book.author || ''}" label="作者"></mdui-text-field>

                <mdui-select label="所在文件夹" variant="outlined" icon="folder" id="editBookFolder">
                    <mdui-menu-item value="">根目录</mdui-menu-item>
                </mdui-select>

                <div class="flex">
                    <mdui-checkbox id="editBookFavorite" ${Utils.isBookFavorited(book.id) ? 'checked' : ''}></mdui-checkbox>
                    <label for="editBookFavorite">添加到收藏夹</label>
                </div>
            </form>
        `;

        let modal = ModalManager.modals[modalId];

        if (!modal) {
            modal = ModalManager.createModal(modalId, '编辑书籍', modalContent);
        } else {
            modal.querySelector('.modal-body').innerHTML = modalContent;
        }

        // 加载文件夹
        const folders = await BookManager.getFolders();
        const selectEl = document.getElementById('editBookFolder');

        folders.folders.forEach(folder => {
            const option = document.createElement('mdui-menu-item');
            option.value = folder.path;
            option.textContent = folder.path;
            option.selected = folder.path === book.folder_path;
            selectEl.appendChild(option);
        });

        hideLoading();

        ModalManager.show(modalId, {
            confirm: async () => {
                const bookId = document.getElementById('editBookId').value;
                const title = document.getElementById('editBookTitle').value.trim();
                const author = document.getElementById('editBookAuthor').value.trim();
                const folder = document.getElementById('editBookFolder').value;
                const isFavorite = document.getElementById('editBookFavorite').checked;

                if (!title) {
                    snackbar.error('书名不能为空');
                    return;
                }

                try {
                    showLoading('保存书籍信息');
                    await BookManager.updateBookInfo(bookId, title, author, folder, undefined, isFavorite);
                    hideLoading();
                    ModalManager.hide(modalId);
                    snackbar.success('书籍信息已更新');
                    refreshLibrary();
                } catch (error) {
                    hideLoading();
                    snackbar.error(error.message || '更新书籍信息失败');
                }
            }
        });
    } catch (error) {
        hideLoading();
        snackbar.error('获取书籍信息失败');
        console.error(error);
    }
}

// 刷新文件夹
async function refreshFolders() {
    try {
        showLoading('加载文件夹');

        const folderData = await BookManager.getFolders();
        const folders = folderData.folders || [];
        const uncategorized = folderData.uncategorized || 0;

        const totalBooks = folders.reduce((sum, folder) => sum + folder.count, 0) + uncategorized;

        document.getElementById('allBooksCount').textContent = `${totalBooks}本书籍`;
        document.getElementById('uncategorizedCount').textContent = `${uncategorized}本书籍`;

        const customFolders = document.querySelectorAll('#foldersList .folder-item:not([data-folder=""]):not([data-folder="uncategorized"])');
        customFolders.forEach(folder => folder.remove());

        folders.forEach(folder => {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            folderItem.setAttribute('data-folder', folder.path);
            folderItem.innerHTML = `
                <mdui-icon name="folder" class="folder-icon"></mdui-icon>
                <div class="folder-info">
                    <div class="folder-name">${folder.path}</div>
                    <div class="folder-count">${folder.count}本书籍</div>
                </div>
                <div class="folder-actions">
                    <mdui-button-icon class="delete-folder-btn" data-folder="${folder.path}" icon="delete"></mdui-button-icon>
                </div>
            `;
            document.getElementById('foldersList').appendChild(folderItem);
        });

        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-folder-btn')) {
                    const folder = item.getAttribute('data-folder');
                    currentFolder = folder;

                    // 更新URL以保存文件夹导航位置
                    if (folder) {
                        history.pushState(null, null, `#library/${encodeURIComponent(folder)}`);
                    } else {
                        history.pushState(null, null, `#library`);
                    }

                    showPage('library');
                }
            });
        });

        document.querySelectorAll('.delete-folder-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const folderToDelete = btn.getAttribute('data-folder');
                const confirmed = await ModalManager.danger('确定要删除文件夹吗？');

                if (confirmed) {
                    try {
                        await BookManager.deleteFolder(folderToDelete);
                        snackbar.success('文件夹已删除');
                        refreshFolders();
                    } catch (error) {
                        snackbar.error(error.message || '删除文件夹失败');
                    }
                }
            });
        });

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('刷新文件夹失败:', error);
        snackbar.error('加载文件夹失败');
    }
}

// 加载个人资料数据
async function loadProfileData() {
    if (!currentUser) return;

    // 更新用户信息
    document.getElementById('profileUsername').textContent = currentUser.username;

    // 格式化注册日期
    const joinDate = new Date(currentUser.createdAt);
    document.getElementById('profileJoinDate').textContent = `${joinDate.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric'
    })}`;

    try {
        // 获取书籍统计
        const result = await BookManager.getBooks("", 1, 1);

        if (result) {
            document.getElementById('totalBooks').textContent = result.total;

            // 计算收藏数量
            const favoriteCount = userSettings.favorites ? userSettings.favorites.length : 0;
            document.getElementById('totalFavorites').textContent = favoriteCount;

            // 计算规则数量
            const ruleCount = userRules ? userRules.length : 0;
            document.getElementById('totalRules').textContent = ruleCount;
        }
    } catch (error) {
        console.error('加载个人资料统计失败:', error);
    }
}

// 刷新章节规则
async function refreshChapterRules() {
    showLoading('加载规则中');

    try {
        // 从缓存或API获取规则
        let rules = await UserManager.getChapterRules();

        if (!rules || rules.length === 0 || rules === undefined) {
            userRules = userRulesDefault;
            await UserManager.saveChapterRules();
            rules = userRules;
        } else {
            userRules = rules;
        }

        const container = document.getElementById('chapterRulesContent');
        container.innerHTML = '';

        if (rules.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="ri-file-list-3-line text-5xl text-gray-400 dark:text-gray-600 mb-4 block"></i>
                    <p class="text-gray-500 dark:text-gray-400">没有章节规则，点击"添加规则"按钮创建</p>
                </div>
            `;
            hideLoading();
            return;
        }

        rules.forEach(rule => {
            const ruleCard = document.createElement('div');
            ruleCard.className = 'card';
            ruleCard.innerHTML = `
                <div>
                    <h3>${rule.name}</h3>
                    <div>
                        <mdui-button-icon class="edit-rule-btn" data-rule-id="${rule.id}" icon="edit"></mdui-button-icon>
                        ${rule.id > 0 ? `<mdui-button-icon class="delete-rule-btn" data-rule-id="${rule.id}" icon="delete"></mdui-button-icon>` : ''}
                        <mdui-checkbox data-rule-id="${rule.id}" ${rule.enable ? 'checked' : ''}></mdui-checkbox>
                    </div>
                </div>
                <div>${rule.rule}</div>
                <div>
                    <span>示例:</span>
                    <span>${rule.example}</span>
                </div>
            `;

            container.appendChild(ruleCard);

            // 切换规则启用/禁用
            ruleCard.querySelector('mdui-checkbox').addEventListener('change', async (e) => {
                const ruleId = parseInt(e.target.getAttribute('data-rule-id'));
                const enabled = e.target.checked;
                const rule = userRules.find(r => r.id === ruleId);

                if (rule) {
                    rule.enable = enabled;
                    await UserManager.saveChapterRules();
                    clearCurrentChapterCache(); // 清除当前章节缓存
                    snackbar.success(`规则已${enabled ? '启用' : '禁用'}`);
                }
            });

            // 编辑规则
            ruleCard.querySelector('.edit-rule-btn').addEventListener('click', () => {
                editChapterRule(rule.id);
            });

            // 删除规则按钮
            const deleteBtn = ruleCard.querySelector('.delete-rule-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    const confirmed = await ModalManager.danger('确定要删除这条规则吗？');

                    if (confirmed) {
                        try {
                            const newRules = userRules.filter(r => r.id !== rule.id);
                            userRules = newRules;
                            await UserManager.saveChapterRules();
                            clearCurrentChapterCache(); // 清除当前章节缓存
                            refreshChapterRules();
                            snackbar.success('规则已删除');
                        } catch (error) {
                            console.error('删除规则失败:', error);
                            snackbar.error('删除规则失败');
                        }
                    }
                });
            }
        });

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('加载章节规则失败:', error);
        snackbar.error('加载规则失败: ' + (error.message || '未知错误'));
    }
}

// 编辑章节规则
function editChapterRule(ruleId) {
    let rule;

    // 创建新规则
    if (ruleId === -1) {
        rule = {
            id: Date.now(),
            name: '新规则',
            rule: '',
            example: '',
            enable: true,
            serialNumber: 99
        };
    } else {
        // 获取现有规则
        rule = userRules.find(r => r.id === ruleId);
        if (!rule) return;
    }

    // 创建对话框
    const modalId = 'ruleEditModal';
    const modalContent = `
        <form id="ruleForm">
            <mdui-text-field variant="outlined" label="ID" type="hidden" id="ruleId" value="${rule.id}"></mdui-text-field>
            <mdui-text-field variant="outlined" label="序号" type="hidden" id="ruleSerialNumber" value="${rule.serialNumber || 99}"></mdui-text-field>
            <mdui-text-field variant="outlined" label="规则名称" id="ruleName" class="form-input" value="${rule.name}"></mdui-text-field>
            <mdui-text-field variant="outlined" label="正则表达式" id="rulePattern" class="form-input" value="${rule.rule}"></mdui-text-field>
            <mdui-text-field variant="outlined" label="示例" id="ruleExample" class="form-input" value="${rule.example}"></mdui-text-field>
            
            <mdui-checkbox id="ruleEnabled" ${rule.enable ? 'checked' : ''}>
                <span>启用规则</span>
            </mdui-checkbox>
        </form>
    `;

    let modal = ModalManager.modals[modalId];

    if (!modal) {
        modal = ModalManager.createModal(modalId, ruleId === -1 ? '添加规则' : '编辑规则', modalContent);
    } else {
        modal.querySelector('.modal-body').innerHTML = modalContent;
    }

    ModalManager.show(modalId, {
        confirm: async () => {
            const editedRule = {
                id: parseInt(document.getElementById('ruleId').value),
                name: document.getElementById('ruleName').value.trim(),
                rule: document.getElementById('rulePattern').value.trim(),
                example: document.getElementById('ruleExample').value.trim(),
                enable: document.getElementById('ruleEnabled').checked,
                serialNumber: parseInt(document.getElementById('ruleSerialNumber').value || '99')
            };

            if (!editedRule.name || !editedRule.rule) {
                snackbar.error('规则名称和正则表达式不能为空');
                return;
            }

            try {
                // 支持正则表达式前的修饰符如(?im)
                // 移除可能存在的修饰符部分以进行有效性测试
                const cleanPattern = editedRule.rule.replace(/^\(\?[a-z]*\)/, '');
                new RegExp(cleanPattern);
            } catch (e) {
                snackbar.error('正则表达式格式错误');
                return;
            }

            try {
                const index = userRules.findIndex(r => r.id === editedRule.id);

                if (index !== -1) {
                    userRules[index] = editedRule;
                } else {
                    userRules.push(editedRule);
                }

                await UserManager.saveChapterRules();
                ModalManager.hide(modalId);
                refreshChapterRules();
                snackbar.success('规则已保存');
            } catch (error) {
                snackbar.error('保存规则失败: ' + error.message);
            }
        }
    });
}

// 导入规则
async function importRules() {
    try {
        // 显示加载覆盖层
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingText').textContent = '导入规则中...';

        // 创建文件输入元素
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';

        // 获取文件内容
        const fileContent = await new Promise((resolve, reject) => {
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = (error) => reject(error);
                reader.readAsText(file);
            };

            fileInput.click();

            // 允许带有较长超时的取消
            setTimeout(() => {
                if (!fileInput.files || fileInput.files.length === 0) {
                    resolve(null);
                }
            }, 3000);
        });

        if (!fileContent) {
            document.getElementById('loadingOverlay').classList.add('hidden');
            return;
        }

        // 解析JSON
        let rules;
        try {
            rules = JSON.parse(fileContent);
        } catch (e) {
            document.getElementById('loadingOverlay').classList.add('hidden');
            snackbar.error('JSON格式错误');
            return;
        }

        // 验证规则
        if (!Array.isArray(rules)) {
            rules = [rules];
        }

        if (rules.length === 0) {
            document.getElementById('loadingOverlay').classList.add('hidden');
            snackbar.error('没有找到有效的规则');
            return;
        }

        // 询问导入模式
        document.getElementById('loadingOverlay').classList.add('hidden');
        const replaceExisting = await ModalManager.confirm(
            '是否替换现有规则？',
            '导入选项',
            { confirmText: '替换', cancelText: '追加' }
        );
        document.getElementById('loadingOverlay').classList.remove('hidden');

        // 处理规则
        const formattedRules = rules.map(rule => ({
            id: rule.id || Date.now() + Math.floor(Math.random() * 1000),
            name: rule.name || '导入规则',
            rule: rule.rule || '',
            example: rule.example || '',
            enable: rule.enable !== false,
            serialNumber: rule.serialNumber || 99
        }));

        if (replaceExisting) {
            userRules = formattedRules;
        } else {
            // 避免ID冲突
            const existingIds = userRules.map(r => r.id);
            formattedRules.forEach(rule => {
                if (existingIds.includes(rule.id)) {
                    rule.id = Date.now() + Math.floor(Math.random() * 1000);
                }
                existingIds.push(rule.id);
            });
            userRules = [...userRules, ...formattedRules];
        }

        await UserManager.saveChapterRules();
        refreshChapterRules();
        document.getElementById('loadingOverlay').classList.add('hidden');
        snackbar.success(`成功导入 ${formattedRules.length} 条规则`);
    } catch (error) {
        console.error('导入规则失败:', error);
        snackbar.error('导入失败: ' + error.message);
    }
}

// 导出规则
function exportRules() {
    try {
        const rulesJson = JSON.stringify(userRules, null, 2);
        const blob = new Blob([rulesJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = 'rules.json';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        snackbar.success('规则已导出');
    } catch (error) {
        console.error('导出规则失败:', error);
        snackbar.error('导出失败: ' + error.message);
    }
}

// 打开书籍
async function openBook(bookId, chapterIndex) {
    try {
        showLoading('加载书籍中');

        currentBook = await BookManager.getBookInfo(bookId);

        if (!currentBook) {
            hideLoading();
            snackbar.error('获取书籍信息失败');
            return;
        }

        // 添加到最近阅读
        Utils.addToRecentBooks(bookId);

        // 更新收藏按钮
        const isFavorited = Utils.isBookFavorited(bookId);
        document.getElementById('toggleFavoriteBtn').icon = isFavorited ? 'star--outlined' : 'star';

        // 加载章节列表
        const chaptersListContainer = document.getElementById('chaptersListContainer');
        chaptersListContainer.innerHTML = '';

        // 异步渲染章节列表，并检查缓存状态
        const renderChapterList = async () => {
            for (let index = 0; index < currentBook.chapters.length; index++) {
                const chapter = currentBook.chapters[index];
                const li = document.createElement('li');

                // 解密章节标题
                const chapterTitle = Utils.decrypt(chapter.title, currentUser.password);

                // 检查章节是否已缓存
                const isCached = await BookManager.isChapterCached(currentBook.id, index);

                let cacheIndicator = '';
                let chapterSizeInfo = ''; // 新增：用于存放章节大小信息

                if (isCached) {
                    cacheIndicator = '<mdui-icon class="chapter-cached-indicator" name="check_circle"></mdui-icon>';
                }

                // 更新 li 的 innerHTML，将章节大小信息放在缓存指示器前面
                li.innerHTML = `
                    ${chapterTitle}
                    ${chapterSizeInfo}${cacheIndicator}
                `;

                li.setAttribute('data-index', index);
                li.addEventListener('click', () => {
                    showChapter(index);
                });

                chaptersListContainer.appendChild(li);

                // 标记当前章节
                if (index === currentBook.lastReadChapter) {
                    li.classList.add('active');
                }
            }
        };

        renderChapterList();

        // 从上次阅读位置继续，如果传入的 chapterIndex 于 currentBook.lastReadChapter 不同，则跳转到指定章节
        if (chapterIndex !== currentBook.lastReadChapter) {
            if (chapterIndex === undefined) {
                chapterIndex = currentBook.lastReadChapter;
                await showChapter(chapterIndex, currentBook.lastReadPosition);
            } else {
                await showChapter(chapterIndex);
            }
        } else {
            await showChapter(currentBook.lastReadChapter, currentBook.lastReadPosition);
        }

        hideLoading();

    } catch (error) {
        hideLoading();
        snackbar.error('加载书籍失败:' + (error.message || '未知错误'));
        console.error(error);
    }
}

// 显示章节
async function showChapter(index, scrollPosition) {
    if (!currentBook) return;

    async function handleScroll() {
        
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        
        const readerHeader = document.querySelector('.reader-header');
        const readerBottomBar = document.querySelector('.reader-bottom-bar');
        
        // 处理 header 背景
        if (scrollTop > readerHeader.scrollHeight) {
            readerHeader.classList.add('bg');
        } else {
            readerHeader.classList.remove('bg');
        }
        
        // 处理 bottom bar 背景
        if (scrollTop + clientHeight < scrollHeight - readerBottomBar.scrollHeight) {
            readerBottomBar.classList.add('bg');
        } else {
            readerBottomBar.classList.remove('bg');
        }

    }

    if (index === undefined) {
        index = currentBook.lastReadChapter;
    }

    if (index >= currentBook.chapterCount) {
        index = currentBook.chapterCount - 1;
        snackbar.error('章节索引超出范围，已跳转到最后一章');
    }

    try {

        // 关闭章节面板
        showPage('reader');

        currentChapterData = await BookManager.getChapter(currentBook.id, index);

        if (!currentChapterData) {
            snackbar.error('获取章节内容失败');
            // 清除页面内容
            document.querySelector('.book-content').innerHTML = '';
            return;
        }

        currentChapter = index;

        // 更新章节进度
        document.getElementById('chapterProgress').textContent = `${index + 1} / ${currentBook.chapterCount}`;

        // 启用/禁用章节导航按钮
        document.getElementById('prevChapterBtn').disabled = index === 0;
        document.getElementById('nextChapterBtn').disabled = index === currentBook.chapterCount - 1;

        // 更新章节列表标记
        const chapterItems = document.querySelectorAll('#chaptersListContainer li');
        chapterItems.forEach(item => {
            item.classList.remove('active');
            const itemIndex = parseInt(item.getAttribute('data-index'));

            if (itemIndex === index) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        // 渲染内容
        const contentDiv = document.querySelector('.book-content');
        contentDiv.innerHTML = `<h1 class="chapter-title">${Utils.decrypt(currentChapterData.title, currentUser.password) || '未知章节'}</h1>${Utils.decrypt(currentChapterData.content, currentUser.password)}`;

        handleScroll();
        
        setTimeout(() => {

            document.documentElement.scrollTop = scrollPosition;

            let throttleTimer = null;

            document.onscroll = () => {
                handleScroll();
                
                if (throttleTimer) return;
                if (!currentBook || currentChapter === undefined) return;
                if (!document.getElementById('readerPage').classList.contains('page-visible')) return;

                throttleTimer = setTimeout(() => {
                    scrollTop = document.documentElement.scrollTop;
                    BookManager.updateBookProgress(currentBook.id, currentChapter, scrollTop);
                    throttleTimer = null; // 重置计时器
                }, 10000); // 10秒 节流
            };

            document.onkeydown = (e) => {
                if (!currentBook || currentChapter === undefined) return;
                if (!document.getElementById('readerPage').classList.contains('page-visible')) return;

                if (e.key === 'ArrowLeft') {
                    document.querySelector('#prevChapterBtn').click();
                }
                if (e.key === 'ArrowRight') {
                    document.querySelector('#nextChapterBtn').click();
                }
            };

        }, 100);

        // 更新URL，记录当前书籍和章节
        if (window.location.hash !== `#reader/${currentBook.id}/${index}`) {
            history.pushState(null, null, `#reader/${currentBook.id}/${index}`);
        }

        if (currentBook && currentBook.chapterCount > 1) {
            // 预缓存2个后续章节，如果到达末尾则循环到开头
            BookManager.preCacheNextChapters(currentBook.id, index, currentBook.chapterCount, 2);
        }

    } catch (error) {
        snackbar.error('加载章节失败:' + (error.message || '未知错误'));
        console.error(error);
    }


    
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {

    //pwa 全屏模式，添加class对此进行适配
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.body.classList.add('pwa-full-screen');
    }

    // 初始化深色模式
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
        userSettings.darkMode = true;
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (event.matches) {
            document.documentElement.classList.add('dark');
            userSettings.darkMode = true;
        } else {
            document.documentElement.classList.remove('dark');
            userSettings.darkMode = false;
        }

        // 保存设置
        if (currentUser) {
            UserManager.saveSettings();
        }
    });

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.error('Service Worker registration failed', err));
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            const { type, updatedUrls } = event.data;

            switch (type) {
                case 'CACHE_UPDATED':
                    snackbar.success('应用已更新');
                    break;
                case 'SW_ACTIVATED':
                    snackbar.success('应用已更新');
                    break;
            }
        });

        // 手动检查更新
        function checkUpdate() {
            navigator.serviceWorker.controller?.postMessage({
                type: 'CHECK_UPDATE'
            });
        }

        // 手动清理缓存
        function cleanupCache() {
            navigator.serviceWorker.controller?.postMessage({
                type: 'CLEANUP_CACHE'
            });
        }
    }

    // 初始化离线管理器
    OfflineManager.init();

    // 文件拖放处理程序（用于导入）
    const dropZone = document.getElementById('dropZone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('border-primary');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-primary');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-primary');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            document.getElementById('bookFile').files = files;
            document.getElementById('bookFile').dispatchEvent(new Event('change'));
        }
    });

    // 底部导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = item.getAttribute('data-page');
            if (pageId) {
                showPage(pageId);
            }
        });
    });

    // 深色模式切换
    document.getElementById('darkModeToggle').addEventListener('change', (e) => {
        userSettings.darkMode = e.target.checked;

        if (e.target.checked) {
            document.documentElement.classList.add('mdui-theme-dark');
        } else {
            document.documentElement.classList.remove('mdui-theme-dark');
        }

        UserManager.saveSettings();
    });

    // 主题颜色选择
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            const color = option.dataset.color;
            applyPrimaryColor(color);
            UserManager.saveSettings();
        });
    });

    // 阅读器主题选择
    document.querySelectorAll('.color-theme').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.color-theme').forEach(theme => {
                theme.classList.remove('active');
            });

            item.classList.add('active');
            const theme = item.getAttribute('data-theme');

            const prevTheme = document.documentElement.className.match(/theme-\w+/)?.[0] || 'theme-default';
            document.documentElement.classList.remove(prevTheme);
            document.documentElement.classList.add(`theme-${theme}`);
            userSettings.colorTheme = theme;
            UserManager.saveSettings();
        });
    });

    // 阅读器设置
    document.getElementById('fontSize').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('fontSizeValue').textContent = `${value}px`;
        document.documentElement.style.setProperty('--font-size', `${value}px`);
    });

    document.getElementById('lineSpacing').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('lineSpacingValue').textContent = value;
        document.documentElement.style.setProperty('--line-spacing', value);
    });

    document.getElementById('firstLineIndent').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('firstLineIndentValue').textContent = `${value}em`;
        document.documentElement.style.setProperty('--first-line-indent', `${value}em`);
    });

    document.getElementById('paragraphSpacing').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('paragraphSpacingValue').textContent = `${value}em`;
        document.documentElement.style.setProperty('--paragraph-spacing', `${value}em`);
    });

    document.getElementById('fontFamily').addEventListener('change', (e) => {
        const value = e.target.value;
        document.documentElement.style.setProperty('--font-family', value);
    });

    document.getElementById('settingsBackBtn').addEventListener('click', () => {
        applyUserSettings();
        // 返回上一页
        history.back();
    });

    // 保存阅读器设置
    document.getElementById('saveSettingsButton').addEventListener('click', async () => {
        userSettings.colorTheme = document.querySelector('.color-theme.active').getAttribute('data-theme');
        userSettings.fontSize = parseInt(document.getElementById('fontSize').value);
        userSettings.lineSpacing = parseFloat(document.getElementById('lineSpacing').value);
        userSettings.firstLineIndent = parseFloat(document.getElementById('firstLineIndent').value);
        userSettings.paragraphSpacing = parseFloat(document.getElementById('paragraphSpacing').value);
        userSettings.fontFamily = document.getElementById('fontFamily').value;

        try {
            showPage('reader');
            await UserManager.saveSettings();
            snackbar.success('设置已保存');
        } catch (error) {
            snackbar.error('保存设置失败');
        }
    });

    // 登录
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            showLoading('登录中');
            UserManager.clearAppData();

            await UserManager.login(username, password);
            hideLoading();
            initAdminPanel();
            showPage('library');

            // 如果启用了锁定功能并设置了密码，登录后立即锁定
            if (userSettings.lockApp && userSettings.lockPassword) {
                lockApp();
            }
        } catch (error) {
            hideLoading();
            snackbar.error(error.message || '登录失败');
        }
    });

    // 注册
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            snackbar.error('两次输入的密码不一致');
            return;
        }

        try {
            showLoading('注册中');
            await UserManager.register(username, password);
            await UserManager.login(username, password);
            hideLoading();
            initAdminPanel();
            showPage('library');
        } catch (error) {
            hideLoading();
            snackbar.error(error.message || '注册失败');
        }
    });

    // 注册状态检查
    document.getElementById('goToRegister').addEventListener('click', async (e) => {
        e.preventDefault();

        try {
            showLoading('检查注册状态');
            const isRegistrationAllowed = await UserManager.checkRegistrationAllowed();
            hideLoading();

            if (isRegistrationAllowed) {
                document.getElementById('registerForm').classList.remove('hidden');
                document.getElementById('registerDisabledMessage').classList.add('hidden');
                showPage('register');
            } else {
                document.getElementById('registerForm').classList.add('hidden');
                document.getElementById('registerDisabledMessage').classList.remove('hidden');
                showPage('register');
            }
        } catch (error) {
            hideLoading();
            snackbar.error('检查注册状态失败');
            showPage('register');
        }
    });

    // 导航链接
    document.getElementById('goToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('login');
    });

    document.getElementById('goBackToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('login');
    });

    // 返回按钮
    document.getElementById('backToLibraryButton').addEventListener('click', () => {
        showPage('library');
    });

    document.getElementById('backToLibraryFromReader').addEventListener('click', () => {
        showPage('library');
    });

    document.getElementById('backToSettingsBtn').addEventListener('click', () => {
        showPage('settings');
    });

    // 添加书籍按钮
    document.getElementById('addBookBtn').addEventListener('click', () => {
        showPage('import');
    });

    document.getElementById('emptyLibraryImportButton').addEventListener('click', () => {
        showPage('import');
    });

    // 文件夹视图按钮
    document.getElementById('folderViewBtn').addEventListener('click', () => {
        showPage('folders');
    });

    // 添加文件夹按钮
    document.getElementById('addFolderBtn').addEventListener('click', async () => {
        const folderName = await ModalManager.prompt('添加文件夹', '输入文件夹名称');

        if (folderName) {
            try {
                await BookManager.createFolder(folderName);
                snackbar.success('文件夹已创建');
                refreshFolders();
            } catch (error) {
                snackbar.error(error.message || '创建文件夹失败');
            }
        }
    });

    // 管理章节规则
    document.getElementById('manageRulesBtn').addEventListener('click', () => {
        showPage('chapterRules');
    });

    // 添加规则按钮
    document.getElementById('addRuleButton').addEventListener('click', () => {
        editChapterRule(-1);
    });

    // 导入/导出规则
    document.getElementById('importRulesBtn').addEventListener('click', () => {
        importRules();
    });

    document.getElementById('exportRulesBtn').addEventListener('click', () => {
        exportRules();
    });

    // 切换收藏（阅读器中）
    document.getElementById('toggleFavoriteBtn').addEventListener('click', async () => {
        if (!currentBook) return;

        const newState = await toggleFavorite(currentBook.id);

        if (newState) {
            document.getElementById('toggleFavoriteBtn').icon = 'star--outlined';
        } else {
            document.getElementById('toggleFavoriteBtn').icon = 'star';
        }
    });

    // 阅读器设置
    document.getElementById('readerSettingsBtn').addEventListener('click', () => {
        showPage('readerSettings');
    });

    // 章节导航
    document.getElementById('prevChapterBtn').addEventListener('click', () => {
        if (currentChapter > 0) {
            showChapter(currentChapter - 1);
        }
    });

    document.getElementById('nextChapterBtn').addEventListener('click', () => {
        if (currentBook && currentChapter < currentBook.chapterCount - 1) {
            showChapter(currentChapter + 1);
        }
    });

    // 章节列表
    document.getElementById('toggleChaptersBtn').addEventListener('click', () => {
        showPage('readerChapters');
    });

    document.getElementById('closeChaptersBtn').addEventListener('click', () => {
        showPage('reader');
    });

    // 章节搜索
    document.getElementById('chapterSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const chapters = document.querySelectorAll('#chaptersListContainer li');

        chapters.forEach(chapter => {
            const title = chapter.textContent.toLowerCase();
            chapter.style.display = query ? (title.includes(query) ? 'flex' : 'none') : 'flex';
        });
    });

    // 书籍搜索
    document.getElementById('bookSearch').addEventListener('input', Utils.debounce(async (e) => {
        const query = e.target.value.toLowerCase().trim();

        // 重置分页
        bookListPage = 1;

        if (!query) {
            // 如果查询为空，清除上次搜索记录并恢复常规书籍列表
            lastSearchQuery = "";
            refreshLibrary();
            return;
        }

        // 保存当前搜索查询到全局变量
        lastSearchQuery = query;

        try {
            // 显示骨架屏
            const gridView = document.getElementById('bookGridView');
            const listView = document.getElementById('bookListView');
            const skeletonView = document.getElementById('bookListSkeleton');
            const emptyLibrary = document.getElementById('emptyLibrary');
            const paginationNav = document.getElementById('paginationNav');

            gridView.classList.add('hidden');
            listView.classList.add('hidden');
            skeletonView.classList.remove('hidden');
            emptyLibrary.classList.add('hidden');
            paginationNav.classList.add('hidden');

            // 执行搜索
            const result = await BookManager.searchBooks(query, currentFolder, bookListPage, bookListPageSize);
            const totalBooks = result.total;
            const totalPages = Math.ceil(totalBooks / bookListPageSize);

            // 隐藏骨架屏
            skeletonView.classList.add('hidden');

            if (result.books.length === 0) {
                // 显示无结果状态
                emptyLibrary.classList.remove('hidden');
                emptyLibrary.innerHTML = `<div class="empty-library-content">
                    <mdui-icon name="search_off" class="empty-library-icon"></mdui-icon>
                    <p class="empty-library-text">没有找到匹配"${query}"的结果</p>
                </div>`;
                return;
            }

            // 清除当前视图
            gridView.innerHTML = '';
            listView.innerHTML = '';

            // 渲染结果
            if (userSettings.viewMode === 'grid') {
                gridView.classList.remove('hidden');
                renderGridView(result.books);
            } else {
                listView.classList.remove('hidden');
                renderListView(result.books);
            }

            // 显示/隐藏分页导航
            if (totalPages > 1) {
                paginationNav.classList.remove('hidden');
                renderPagination(bookListPage, totalPages, totalBooks);
            } else {
                paginationNav.classList.add('hidden');
            }

            // 更新URL，包含搜索参数
            let newHash = `#library/search/${encodeURIComponent(query)}`;
            if (bookListPage > 1) {
                newHash += `/${bookListPage}`;
            }
            history.replaceState(null, null, newHash);

        } catch (error) {
            console.error('搜索失败:', error);
            snackbar.error('搜索失败: ' + (error.message || '未知错误'));
        }
    }, 300));

    // 书籍过滤器
    const filterButtons = ['All', 'Favorites', 'Recent'];
    filterButtons.forEach(filter => {
        document.getElementById(`filter${filter}Btn`).addEventListener('click', async () => {
            const filterLower = filter.toLowerCase();
            if (currentFilter === filterLower) return;

            currentFilter = filterLower;
            bookListPage = 1;

            // 更新UI
            filterButtons.forEach(btn => {
                const element = document.getElementById(`filter${btn}Btn`);
                if (btn === filter) {
                    element.selected = true;
                } else {
                    element.selected = false;
                }
            });

            // 清除缓存
            await CacheManager.clearWithPrefix('book_list');
            refreshLibrary();
        });
    });

    document.getElementById('filterRecentBtn').addEventListener('click', async () => {
        if (currentFilter === 'recent') return;

        currentFilter = 'recent';
        bookListPage = 1;

        // 更新UI
        document.getElementById('filterRecentBtn').selected = true;

        // 清除缓存
        await CacheManager.clearWithPrefix('book_list');
        refreshLibrary();
    });

    // 添加分页导航事件监听器
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (bookListPage > 1) {
            goToPage(bookListPage - 1);
        }
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
        goToPage(bookListPage + 1);
    });

    // 视图切换（网格/列表）
    document.getElementById('viewToggleBtn').addEventListener('click', () => {
        if (userSettings.viewMode === 'grid') {
            userSettings.viewMode = 'list';
            document.getElementById('viewToggleBtn').innerHTML = '<mdui-icon name="event_list"></mdui-icon>';
        } else {
            userSettings.viewMode = 'grid';
            document.getElementById('viewToggleBtn').innerHTML = '<mdui-icon name="grid_view"></mdui-icon>';
        }

        // 更新用户设置
        UserManager.saveSettings();
        refreshLibrary();
    });

    // 选择模式
    document.getElementById('selectModeBtn').addEventListener('click', () => {
        if (selectionMode) {
            disableSelectionMode();
        } else {
            enableSelectionMode();
        }
    });

    // 批量操作
    document.getElementById('cancelSelectionBtn').addEventListener('click', () => {
        disableSelectionMode();
    });

    document.getElementById('batchMoveBtn').addEventListener('click', async () => {
        if (selectedBooks.size === 0) {
            snackbar.error('请先选择书籍');
            return;
        }

        await moveBookToFolder(Array.from(selectedBooks));
    });

    document.getElementById('batchDeleteBtn').addEventListener('click', async () => {
        if (selectedBooks.size === 0) {
            snackbar.error('请先选择书籍');
            return;
        }

        const confirmed = await ModalManager.danger(`确定要删除选中的 ${selectedBooks.size} 本书籍吗？此操作不可恢复。`);

        if (confirmed) {
            try {
                await BookManager.batchProcessBooks('delete', Array.from(selectedBooks));
                snackbar.success(`已删除 ${selectedBooks.size} 本书籍`);
                disableSelectionMode();
                refreshLibrary();
            } catch (error) {
                snackbar.error(error.message || '批量删除失败');
            }
        }
    });

    // 全选功能
    document.getElementById('selectAllBtn').addEventListener('click', () => {
        const books = document.querySelectorAll('.book-card, .book-list-item');
        books.forEach(book => {
            const bookId = book.getAttribute('data-book-id');
            if (bookId) {
                selectedBooks.add(bookId);
                book.classList.add('selected');
            }
        });

        // 更新选择计数
        document.getElementById('selectedCount').textContent = `已选择 ${selectedBooks.size} 项`;

        // 显示批量工具栏
        if (selectedBooks.size > 0) {
            document.getElementById('batchToolbar').classList.add('visible');
        }
    });

    // 反选功能 
    document.getElementById('invertSelectionBtn').addEventListener('click', () => {
        const books = document.querySelectorAll('.book-card, .book-list-item');
        books.forEach(book => {
            const bookId = book.getAttribute('data-book-id');
            if (bookId) {
                if (selectedBooks.has(bookId)) {
                    selectedBooks.delete(bookId);
                    book.classList.remove('selected');
                } else {
                    selectedBooks.add(bookId);
                    book.classList.add('selected');
                }
            }
        });

        // 更新选择计数
        document.getElementById('selectedCount').textContent = `已选择 ${selectedBooks.size} 项`;

        // 显示/隐藏批量工具栏
        if (selectedBooks.size > 0) {
            document.getElementById('batchToolbar').classList.add('visible');
        } else {
            document.getElementById('batchToolbar').classList.remove('visible');
        }
    });

    // 根文件夹链接
    document.getElementById('rootFolderLink').addEventListener('click', (e) => {
        e.preventDefault();
        currentFolder = "";
        refreshLibrary();
    });

    // 导入TXT
    document.getElementById('bookFile').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);

        if (files.length === 0) return;

        // 验证文件类型
        if (!files.every(file => file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt'))) {
            snackbar.error('请只选择 TXT 文件');
            return;
        }

        if (files.length === 1) {
            // 单文件导入
            showLoading('处理文件中');
            await processSingleTxtFile(files[0]);
        } else {
            // 批量导入
            setupBatchImport(files);
        }
    });

    // 批量导入
    document.getElementById('startBatchImportBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('bookFile');
        const files = Array.from(fileInput.files);

        if (files.length === 0) {
            snackbar.error('未选择文件');
            return;
        }

        const folder = document.getElementById('batchImportFolder').value;
        const isFavorite = document.getElementById('favoriteOnBatchImport').checked;

        showLoading(`准备批量导入 ${files.length} 个文件到 ${folder}...`);
        showImportProgress();

        // 创建批处理函数
        const processBatchBooks = async (batchFiles, startIndex, totalCount) => {
            const results = [];

            // 更新进度
            updateImportProgress(startIndex, totalCount, (startIndex / totalCount) * 100);

            // 并行上传处理
            const uploadPromises = batchFiles.map(async (file, idx) => {
                try {
                    // 读取文件
                    const content = await readFileAsText(file);

                    // 使用文件名作为标题
                    const title = file.name.replace(/\.txt$/i, '');

                    // 保存书籍
                    return await BookManager.saveBook(title, '', content, folder, isFavorite);
                } catch (error) {
                    console.error(`导入${file.name}失败:`, error);
                    return null;
                }
            });

            // 等待所有上传完成
            const bookResults = await Promise.all(uploadPromises);

            // 统计结果
            return {
                success: true,
                successCount: bookResults.filter(result => result !== null).length,
                failCount: bookResults.filter(result => result === null).length
            };
        };

        try {
            // 批量处理所有文件，每批2个文件，并发度为2
            const result = await Utils.processBatch(files, processBatchBooks, 2, 2);

            hideLoading();

            // 统计总体结果
            const totalSuccess = result.results.reduce((sum, r) => sum + r.successCount, 0);
            const totalFail = result.results.reduce((sum, r) => sum + r.failCount, 0);

            if (totalSuccess > 0) {
                snackbar.success(`成功导入${totalSuccess}个文件`);
            }

            if (totalFail > 0) {
                snackbar.error(`${totalFail}个文件导入失败`);
            }

            showPage('library');
        } catch (error) {
            hideLoading();
            snackbar.error(`批量导入失败: ${error.message || '未知错误'}`);
        }
    });

    // 批量导入时的新建文件夹按钮
    document.getElementById('newFolderForBatchBtn').addEventListener('click', async () => {
        const folderName = await ModalManager.prompt('新建文件夹', '输入文件夹名称');

        if (folderName) {
            try {
                await BookManager.createFolder(folderName);
                snackbar.success('文件夹已创建');

                // 更新文件夹选择
                const folderSelect = document.getElementById('batchImportFolder');
                const option = document.createElement('mdui-menu-item');
                option.value = folderName;
                option.textContent = folderName;
                option.selected = true;
                folderSelect.appendChild(option);
            } catch (error) {
                snackbar.error(error.message || '创建文件夹失败');
            }
        }
    });

    // 单书导入的新建文件夹按钮
    document.getElementById('newFolderBtn').addEventListener('click', async () => {
        const folderName = await ModalManager.prompt('新建文件夹', '输入文件夹名称');

        if (folderName) {
            try {
                await BookManager.createFolder(folderName);
                snackbar.success('文件夹已创建');

                // 更新文件夹选择
                const folderSelect = document.getElementById('bookFolder');
                const option = document.createElement('mdui-menu-item');
                option.value = folderName;
                option.textContent = folderName;
                option.selected = true;
                folderSelect.appendChild(option);
            } catch (error) {
                snackbar.error(error.message || '创建文件夹失败');
            }
        }
    });

    // 单本书籍导入
    document.getElementById('importBookSubmit').addEventListener('click', async () => {
        const title = document.getElementById('bookTitle').value.trim();
        const author = document.getElementById('bookAuthor').value.trim();
        const folder = document.getElementById('bookFolder').value;
        const isFavorite = document.getElementById('favoriteOnImport').checked;
        const fileInput = document.getElementById('bookFile');

        if (!title) {
            snackbar.error('请输入书名');
            return;
        }

        if (!fileInput.files.length) {
            snackbar.error('请选择要导入的文件');
            return;
        }

        try {
            showLoading('处理书籍中');

            // 读取文件内容
            const file = fileInput.files[0];
            const content = await readFileAsText(file);

            // 保存书籍
            await BookManager.saveBook(title, author, content, folder, isFavorite);

            hideLoading();
            snackbar.success('导入成功');
            showPage('library');
        } catch (error) {
            hideLoading();
            snackbar.error('保存失败:' + (error.message || '未知错误'));
        }
    });

    document.getElementById('deleteAccountButton').addEventListener('click', async () => {
        const modalId = 'deleteAccountModal';
        const modalContent = `
            <form id="deleteAccountForm">
                <p>此操作将永久删除您的账号和所有数据，无法恢复。</p>
                <mdui-text-field id="deleteAccountPassword" variant="outlined" type="password" toggle-password label="请输入密码确认"></mdui-text-field>
            </form>
        `;

        let modal = ModalManager.modals[modalId];

        if (!modal) {
            modal = ModalManager.createModal(modalId, '删除账号', modalContent, {
                confirmText: '确认删除',
                confirmClass: 'bg-red-600 hover:bg-red-700'
            });
        } else {
            modal.querySelector('.modal-body').innerHTML = modalContent;
        }

        ModalManager.show(modalId, {
            confirm: async () => {
                const password = document.getElementById('deleteAccountPassword').value;

                if (!password) {
                    snackbar.error('请输入密码');
                    return false;
                }

                try {
                    showLoading('删除账号中');
                    const success = await UserManager.deleteAccount(password);
                    hideLoading();

                    if (success) {
                        ModalManager.hide(modalId);
                        snackbar.success('账号已删除');
                        showPage('login');
                        return true;
                    } else {
                        snackbar.error('删除账号失败');
                        return false;
                    }
                } catch (error) {
                    hideLoading();
                    console.error('删除账号失败:', error);
                    throw error;
                }
            }
        });
    });

    // 同步数据
    document.getElementById('syncDataButton').addEventListener('click', async () => {
        if (!currentUser) {
            snackbar.error('请先登录');
            return;
        }

        await UserManager.syncUserData();
    });

    // 登出
    document.getElementById('logoutButton').addEventListener('click', () => {
        ModalManager.confirm('确定要退出登录吗？').then(confirmed => {
            if (confirmed) {
                UserManager.logout();
            }
        });
    });

    // 初始化API选择器
    function initApiSelector() {
        const apiSelect = document.getElementById('apiUrlSelect');
        if (apiSelect) {
            // 清空现有选项
            apiSelect.innerHTML = '';

            // 添加API选项
            API_URL_LIST.forEach((api, index) => {
                const option = document.createElement('mdui-menu-item');
                option.value = api.url;
                option.textContent = api.name;
                if (api.url === API_URL) {
                    option.selected = true;
                }
                apiSelect.appendChild(option);
            });

            // 监听选择变化
            apiSelect.addEventListener('change', (e) => {

                if (e.target.value == '') {
                    e.target.value = API_URL;
                    return;
                }

                API_URL = e.target.value;
                localStorage.setItem('selected_api_url', API_URL);
                console.log('API URL已切换至:', API_URL);
            });

            apiSelect.value = API_URL;
        }
    }

    // 在DOMContentLoaded中调用
    initApiSelector();

    // 初始化对话框
    initializeApp();
});

// 使用jschardet自动检测编码并读取文件为文本
async function readFileAsText(file) {
    try {
        // 1. 读取前 N 字节
        const chunkSize = Math.min(file.size, 1024 * 1024);
        const chunk = await readFileChunk(file, 0, chunkSize); // ArrayBuffer

        // 2. 转成 "二进制字符串"
        const uint8 = new Uint8Array(chunk);
        let binaryStr = '';
        for (let i = 0; i < uint8.length; i++) {
            binaryStr += String.fromCharCode(uint8[i]);
        }

        // 3. 用 jschardet 检测
        const result = jschardet.detect(binaryStr);
        let detectedEncoding = (result.encoding || 'UTF-8').toUpperCase();
        const confidence = result.confidence || 0;

        // 4. 日志输出
        console.log(`jschardet 检测到编码: ${detectedEncoding}, 置信度: ${confidence.toFixed(2)}`);

        // 直接使用检测到的编码
        const content = await readWithEncoding(file, detectedEncoding);

        return content;
    } catch (error) {
        console.error('读取文件失败:', error);
        throw new Error('读取文件失败');
    }
}

// 帮助函数，读取文件的一部分作为ArrayBuffer
async function readFileChunk(file, start, length) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取文件块失败'));

        const blob = file.slice(start, start + length);
        reader.readAsArrayBuffer(blob);
    });
}

// 帮助函数，使用特定编码读取文件
async function readWithEncoding(file, encoding) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error(`读取失败 (${encoding})`));
        reader.readAsText(file, encoding);
    });
}

// 处理单个TXT文件
async function processSingleTxtFile(file) {
    try {
        // 读取文件内容
        const content = await readFileAsText(file);

        // 加载文件夹选项
        await loadFolderOptions(document.getElementById('bookFolder'));

        // 显示书籍信息表单
        document.getElementById('batchImportOptions').classList.add('hidden');
        document.getElementById('singleBookForm').classList.remove('hidden');

        // 从文件名设置默认书名
        const fileName = file.name.replace(/\.txt$/i, '');
        document.getElementById('bookTitle').value = fileName;

        hideLoading();
    } catch (error) {
        hideLoading();
        snackbar.error('处理文件失败: ' + error.message);
    }
}

// 设置批量导入
async function setupBatchImport(files) {
    try {
        // 加载批量导入的文件夹选项
        const folderSelect = document.getElementById('batchImportFolder');
        await loadFolderOptions(folderSelect);

        // 更新文件数量
        document.getElementById('batchFileCount').textContent = files.length;

        // 显示批量选项
        document.getElementById('singleBookForm').classList.add('hidden');
        document.getElementById('batchImportOptions').classList.remove('hidden');
    } catch (error) {
        console.error('设置批量导入失败:', error);
        snackbar.error('准备批量导入失败');
    }
}

// 将文件夹选项加载到选择元素中
async function loadFolderOptions(selectElement) {
    try {
        // 清空现有选项
        selectElement.querySelectorAll('mdui-menu-item').forEach(item => item.remove());

        // 添加默认选项
        const defaultOption = document.createElement('mdui-menu-item');
        defaultOption.value = '';
        defaultOption.textContent = '根目录';
        selectElement.appendChild(defaultOption);

        // 加载文件夹选项
        const folderData = await BookManager.getFolders();
        const folders = folderData.folders || [];

        for (const folder of folders) {
            const option = document.createElement('mdui-menu-item');
            option.value = folder.path;
            option.textContent = folder.path;
            selectElement.appendChild(option);
        }

        // 如果在某个文件夹中，则选择当前文件夹
        if (currentFolder && currentFolder !== 'uncategorized') {
            selectElement.value = currentFolder;
        }
    } catch (error) {
        console.error('加载文件夹选项失败:', error);
    }
}

// 锁定应用
function lockApp() {

    // 给 documentElement 添加 locked 类
    document.documentElement.classList.add('locked');

    // 暂停视频播放器（如果正在播放）
    const videoPlayer = document.getElementById('customVideoPlayer');
    if (videoPlayer && !videoPlayer.paused) {
        videoPlayer.pause();
        console.log('应用锁定时暂停视频播放');
    }

    // 暂停iframe中的视频（如果有）
    const iframePlayer = document.getElementById('iframePlayerFrame');
    if (iframePlayer && iframePlayer.src && iframePlayer.src !== 'about:blank') {
        // 重载iframe
        iframePlayer.contentWindow.location.reload();
    }

    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
        lockScreen.classList.add('active');
        // 重置密码输入
        currentPassword = '';
        updatePasswordDots();

        // 设置 iframe 源
        const disguiseFrame = document.getElementById('disguiseFrame');
        const standardLockScreen = document.getElementById('standardLockScreen');
        const disguiseLockScreen = document.getElementById('disguiseLockScreen');

        if (disguiseFrame && standardLockScreen && disguiseLockScreen) {
            if (userSettings.lockDisguiseMode === 'standard') {
                standardLockScreen.classList.remove('hidden');
                disguiseLockScreen.classList.add('hidden');
            } else {
                standardLockScreen.classList.add('hidden');
                disguiseLockScreen.classList.remove('hidden');

                // 设置 iframe 源
                switch (userSettings.lockDisguiseMode) {
                    case 'calculator':
                        disguiseFrame.src = './lock-calc.html';
                        break;
                    default:
                        disguiseFrame.src = '';
                        break;
                }
            }
        }
    }
}

// 解锁应用
function unlockApp() {

    // 移除 locked 类
    document.documentElement.classList.remove('locked');

    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
        lockScreen.classList.remove('active');
        resetInactivityTimer();
    }
}

// 更新密码点显示
function updatePasswordDots() {
    const dots = document.querySelectorAll('#lockScreen .password-dot');
    dots.forEach((dot, index) => {
        if (index < currentPassword.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

// 验证密码
function verifyPassword() {
    if (currentPassword === userSettings.lockPassword) {
        unlockApp();
        return true;
    } else {
        // 密码错误，显示错误提示并清空输入
        const lockTitle = document.querySelector('#lockScreen .lock-title');
        const originalText = lockTitle.textContent;
        lockTitle.textContent = '密码错误，请重试';
        lockTitle.style.color = 'rgb(var(--mdui-color-error))';

        // 震动效果
        const passwordContainer = document.querySelector('#lockScreen .password-container');
        passwordContainer.style.animation = 'shake 0.5s';

        // 重置状态
        setTimeout(() => {
            lockTitle.textContent = originalText;
            lockTitle.style.color = '';
            passwordContainer.style.animation = '';
            currentPassword = '';
            updatePasswordDots();
        }, 1000);

        return false;
    }
}

// 初始化应用
async function initializeApp() {
    try {

        initLockScreenNumpad();

        // 添加消息事件监听器，处理伪装模式中的密码输入
        window.addEventListener('message', (event) => {
            // 处理来自 iframe 的密码消息
            if (event.data && event.data.type === 'password') {
                currentPassword = event.data.value;
                verifyPassword();
            }
        });

        // 添加锁定应用按钮事件
        document.getElementById('lockAppButton')?.addEventListener('click', () => {
            setLockPassword();
        });

        // 添加立即锁定按钮事件
        document.getElementById('lockNowButton')?.addEventListener('click', () => {
            if (userSettings.lockApp && userSettings.lockPassword) {
                lockApp();
            } else {
                snackbar.error('你需要先启用应用锁定并已经设置密码');
            }
        });

        // 添加锁定应用开关事件
        document.getElementById('lockAppToggle')?.addEventListener('change', async (e) => {
            userSettings.lockApp = e.target.checked;

            if (userSettings.lockApp) {
                if (!userSettings.lockPassword) {
                    // 如果启用锁定但没有设置密码，提示设置密码
                    setLockPassword();
                } else {
                    // 初始化不活动计时器
                    initInactivityTimer();
                }
            } else {
                // 禁用锁定，清除计时器
                if (inactivityTimer) {
                    clearTimeout(inactivityTimer);
                    inactivityTimer = null;
                }
            }

            // 保存设置
            await UserManager.saveSettings();
        });

        // 添加锁定超时时间滑块事件
        document.getElementById('lockTimeoutSlider')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('lockTimeoutValue').textContent = `${value}分钟`;
        });

        document.getElementById('lockTimeoutSlider')?.addEventListener('change', async (e) => {
            const value = parseInt(e.target.value);
            userSettings.lockTimeout = value;
            await UserManager.saveSettings();
            snackbar.success(`锁定超时时间已更新为 ${value} 分钟`);

            // 如果锁定已启用，重置计时器
            if (userSettings.lockApp && inactivityTimer) {
                resetInactivityTimer();
            }
        });

        // 添加锁定界面选择事件
        document.getElementById('lockDisguiseModeSelect')?.addEventListener('change', async (e) => {
            userSettings.lockDisguiseMode = e.target.value;
            await UserManager.saveSettings();
        });

        // 添加应用相关事件
        document.getElementById('addAppButton')?.addEventListener('click', addApp);

        // 添加 URL hash 变化监听器，支持 PWA URL 导航
        window.addEventListener('hashchange', () => {
            console.log('hashchange: ', window.location.hash);
            handleURLNavigation();
        });

        // 检查初始 URL 是否包含 hash
        const initialHash = window.location.hash.substring(1);
        let initialPage = 'login';

        // 尝试自动登录
        const savedSession = UserManager.getSessionFromStorage();

        if (savedSession) {

            if (OfflineManager.isOffline) {
                currentUser = savedSession;

                // 尝试恢复本地缓存的设置 / 章节规则
                const cached = await CacheManager.get('user_settings');
                if (cached?.settings) userSettings = { ...userSettings, ...cached.settings };
                if (cached?.userRules) userRules = cached.userRules;

                applyUserSettings();
                initAdminPanel();                    // 仍然初始化管理员视图（本地）

                // URL 有 hash 时按原逻辑跳转，否则进书库
                if (initialHash) {
                    handleURLNavigation();
                } else {
                    initialPage = 'library';
                    showPage(initialPage);
                }

                // 离线也要更新 UI 中的禁用状态 / 离线提示
                OfflineManager.updateUIForOfflineMode();
                OfflineManager.updateBookOfflineButtons();

                if (userSettings.lockApp && userSettings.lockPassword) {
                    lockApp();
                }
            } else {
                showLoading('登录中');
                try {
                    await UserManager.login();         // 联网刷新 token
                    hideLoading();
                    initAdminPanel();

                    if (initialHash) {
                        handleURLNavigation();
                    } else {
                        initialPage = 'library';
                        showPage(initialPage);
                    }

                    if (userSettings.lockApp && userSettings.lockPassword) {
                        lockApp();
                    }
                } catch (error) {
                    hideLoading();
                    showPage('login');
                }
            }

        } else {
            showPage('login');
        }

    } catch (error) {
        hideLoading();
        console.error('初始化失败:', error);
        snackbar.error('初始化失败');
        showPage('login');
    }
}

// 前端章节解析和处理
const ChapterProcessor = {
    // 解析章节
    parseChapters(textContent, rules) {
        try {
            // 如果文本为空，直接返回空数组
            if (!textContent || textContent.trim() === '') {
                console.error('解析章节失败: 文本内容为空');
                return [{
                    title: '全文',
                    content: '<p>内容为空</p>'
                }];
            }

            console.log(`开始解析章节，文本长度: ${textContent.length}字节`);

            // 如果没有规则或文本为空，直接返回整个内容作为一章
            if (!rules || !rules.length) {
                console.log('没有提供章节规则，将整个内容作为一章');
                return [{
                    title: '全文',
                    content: this.formatChapterContent(textContent)
                }];
            }

            // 获取启用的规则
            const enabledRules = rules.filter(rule => rule.enable);

            if (enabledRules.length === 0) {
                console.log('没有启用的章节规则，将整个内容作为一章');
                return [{
                    title: '全文',
                    content: this.formatChapterContent(textContent)
                }];
            }

            console.log(`发现${enabledRules.length}条已启用的规则`);

            // 分割文本为行
            const lines = textContent.split(/\r?\n/);
            let chapters = [];
            let currentTitle = '';
            let currentContent = '';
            let chapterStarted = false;

            // 构建匹配函数
            const matchChapterTitle = (line) => {
                for (const rule of enabledRules) {
                    try {
                        let rulePattern = rule.rule;
                        let flags = 'gm';

                        // 提取标志
                        const flagsMatch = rulePattern.match(/^\(\?([imsuxy]+)\)/);
                        if (flagsMatch) {
                            flags = flagsMatch[1];
                            rulePattern = rulePattern.substring(flagsMatch[0].length);
                        }

                        // 创建正则并测试
                        const regex = new RegExp(rulePattern, flags);
                        if (regex.test(line)) {
                            console.log(`匹配到章节标题: ${line}，使用规则: ${rulePattern}`);
                            return true;
                        }
                    } catch (e) {
                        // 如果正则无效，尝试普通文本匹配
                        if (line.includes(rule.rule)) {
                            console.log(`文本匹配到章节标题: ${line}，包含: ${rule.rule}`);
                            return true;
                        }
                    }
                }
                return false;
            };

            // 处理每一行文本
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // 跳过空行
                if (!line) continue;

                // 检查是否是章节标题
                if (matchChapterTitle(line)) {
                    // 如果已经有内容，保存上一章节
                    if (currentTitle && currentContent) {
                        chapters.push({
                            title: currentTitle,
                            content: this.formatChapterContent(currentContent)
                        });
                    }

                    // 设置新章节标题
                    currentTitle = line;

                    // 优化：不再在内容中重复标题
                    currentContent = '';
                    chapterStarted = true;
                } else if (chapterStarted) {
                    // 如果已经开始了章节，添加内容
                    currentContent += line + '\n';
                } else {
                    // 如果还没有找到第一个章节标题，创建默认章节
                    currentTitle = '开始';
                    currentContent = line + '\n';
                    chapterStarted = true;
                }
            }

            // 添加最后一章
            if (currentTitle && currentContent) {
                chapters.push({
                    title: currentTitle,
                    content: this.formatChapterContent(currentContent)
                });
            }

            // 如果没有找到章节（或者只有一个"开始"章节）
            if (chapters.length === 0 || (chapters.length === 1 && chapters[0].title === '开始')) {
                console.log('未能识别到有效章节，将整个内容作为一章');
                return [{
                    title: '全文',
                    content: this.formatChapterContent(textContent)
                }];
            }

            console.log(`成功解析出${chapters.length}个章节`);
            // 记录每章的标题和内容长度，用于调试
            chapters.forEach((ch, idx) => {
                console.log(`章节${idx + 1}: ${ch.title} (内容长度: ${ch.content.length}字节)`);
            });

            return chapters;
        } catch (error) {
            console.error('解析章节失败:', error);
            // 发生错误时，仍然尝试返回整个内容
            return [{
                title: '解析错误-全文',
                content: this.formatChapterContent(textContent) || '<p>内容解析失败</p>'
            }];
        }
    },

    // 格式化章节内容
    formatChapterContent(content) {
        if (!content) return '<p>空内容</p>';

        try {
            // 删除多余空行
            let result = content.replace(/\n{3,}/g, '\n\n');

            // 将每行转换为段落
            let paragraphs = result.split(/\n/).map(line => {
                line = line.trim();
                if (!line) return '';
                // 如果已经是HTML标签，不再包裹
                if (line.startsWith('<') && line.endsWith('>')) return line;
                return line.startsWith('<p>') ? line : `<p>${line}</p>`;
            }).filter(p => p);

            // 如果没有段落，返回提示
            if (paragraphs.length === 0) {
                return '<p>内容解析后为空</p>';
            }

            return paragraphs.join('\n');
        } catch (error) {
            console.error('格式化章节内容失败:', error);
            return '<p>内容格式化失败</p>';
        }
    }
};

async function initAdminPanel() {
    const isAdmin = currentUser.isAdmin;
    const adminBtn = document.getElementById('adminEntryBtn');
    if (isAdmin) {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }
}

// 管理员页面事件委托
document.getElementById('adminPage').addEventListener('click', function (e) {

    // 启用/禁用用户
    const toggleBtn = e.target.closest('.toggle-status-btn');
    if (toggleBtn) {
        const userId = toggleBtn.getAttribute('data-user-id');
        const currentStatus = toggleBtn.getAttribute('data-status');
        const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
        ModalManager.confirm(`确定要${newStatus === 'active' ? '启用' : '禁用'}该用户？`).then(async confirmed => {
            if (confirmed) {
                try {
                    const resp = await ApiService.call(`/admin/users/${userId}`, 'PUT', { status: newStatus });

                    await Promise.all([
                        loadUserList(),
                        loadSystemSettings()
                    ]);
                } catch (err) {
                    console.error('更新用户状态失败:', err);
                    snackbar.error(err.message || '更新用户状态失败');
                }
            }
        });
        return;
    }

    // 删除用户
    const delBtn = e.target.closest('.delete-user-btn');
    if (delBtn) {
        const userId = delBtn.getAttribute('data-user-id');
        ModalManager.confirm('确定要删除该用户？此操作不可恢复！').then(async confirmed => {
            if (!confirmed) return;
            try {
                const resp = await ApiService.call(`/admin/users/${userId}`, 'DELETE');

                await Promise.all([
                    loadUserList(),
                    loadSystemSettings()
                ]);
            } catch (err) {
                console.error('删除用户失败:', err);
                snackbar.error(err.message || '删除失败');
            }
        });
        return;
    }
});

// 加载管理员数据
async function loadAdminData() {
    await Promise.all([
        loadUserList(),
        loadSystemSettings()
    ]);
}

// 加载用户列表
async function loadUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    try {
        const resp = await ApiService.call(`/admin/users`, 'GET');
        const users = resp.users || [];
        if (users.length === 0) {
            userList.innerHTML = '<div class="text-center py-4 text-gray-400">暂无用户</div>';
            return;
        }
        userList.innerHTML = users.map(user => `
            <div class="flex">
                <div class="flex">
                    <span>${user.username}</span>
                    <span>${user.is_admin ? '管理员' : ''}</span>
                    <span>${user.created_at ? user.created_at.split('T')[0] : ''}</span>
                </div>
                <div class="flex">
                    ${!user.is_admin ? `
                    <mdui-button class="toggle-status-btn" data-user-id="${user.id}" data-status="${user.account_status}">
                        ${user.account_status === 'active' ? '已启用' : '已禁用'}
                    </mdui-button>
                    ` : ''}
                    ${!user.is_admin ? `
                    <mdui-button-icon class="delete-user-btn" data-user-id="${user.id}" icon="delete"></mdui-button-icon>
                    ` : ''}
                </div>
            </div>
        `).join('');
    } catch (e) {
        snackbar.error('加载用户列表失败');
    }
}

// 加载系统设置
async function loadSystemSettings() {
    try {
        const resp = await ApiService.call(`/admin/settings`, 'GET');

        const data = resp;
        document.getElementById('allowRegistrationToggle').checked = data.settings.allow_registration === true || data.settings.allow_registration === 'true';
        document.getElementById('demoModeToggle').checked = data.settings.demo_mode === true || data.settings.demo_mode === 'true';

    } catch (e) {

        // 加载失败时禁用所有设置
        ['allowRegistrationToggle', 'demoModeToggle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });

    }

    // 设置切换事件
    ['allowRegistrationToggle', 'demoModeToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', async function () {
                const payload = {
                    allow_registration: document.getElementById('allowRegistrationToggle').checked,
                    demo_mode: document.getElementById('demoModeToggle').checked
                };
                try {
                    const resp = await ApiService.call(`/admin/settings`, 'PUT', payload);
                } catch (err) {
                    console.error('更新系统设置失败:', err);
                    snackbar.error(err.message || '更新系统设置失败');
                }
            });
        }
    });
}

// 修改 handleURLNavigation 函数以支持分页参数和搜索参数
function handleURLNavigation() {

    const hash = window.location.hash.substring(1); // 移除 '#' 符号
    const url = new URL(window.location.href);
    const searchParams = new URLSearchParams(url.search);

    // 处理URL参数
    // 检查是否有页码参数
    const pageParam = searchParams.get('page');
    if (pageParam) {
        const page = parseInt(pageParam, 10);
        if (!isNaN(page) && page > 0) {
            bookListPage = page;
        }
    } else {
        // 如果没有页码参数，默认为第一页
        bookListPage = 1;
    }

    // 检查是否有搜索参数
    const searchParam = searchParams.get('search');
    if (searchParam) {
        lastSearchQuery = decodeURIComponent(searchParam);
        // 如果有搜索框，更新搜索框的值
        const searchInput = document.getElementById('bookSearch');
        if (searchInput) {
            searchInput.value = lastSearchQuery;
        }
    }

    // 处理直接视频播放链接，支持 videoPlayer/videoId/episodeIndex 格式
    if (hash.startsWith('videoPlayer/')) {
        const parts = hash.split('/');
        const videoId = decodeURIComponent(parts[1]); // 解码视频ID处理特殊字符
        const episodeIndex = parts[2] ? parseInt(parts[2], 10) : 0;

        if (videoId) {
            console.log('尝试恢复播放视频:', videoId, '集数:', episodeIndex);
            // 查找视频源
            let targetVideo = null;

            // 先从收藏查找
            if (userSettings.favoriteVideos) {
                targetVideo = userSettings.favoriteVideos.find(v => v.id === videoId);
            }

            // 再从最近观看查找
            if (!targetVideo && userSettings.recentVideos) {
                targetVideo = userSettings.recentVideos.find(v => v.id === videoId);
            }

            // 再从自定义视频查找
            if (!targetVideo && userSettings.customVideos) {
                targetVideo = userSettings.customVideos.find(v => v.id === videoId);
            }

            if (targetVideo) {
                try {
                    // 使用VideoManager播放视频，明确指定集数
                    showLoading('加载视频中...');
                    console.log(`播放视频(ID: ${videoId})的第${episodeIndex + 1}集`);
                    VideoManager.playVideoItem(targetVideo, episodeIndex).catch(error => {
                        console.error('播放视频失败:', error);
                        showPage('video'); // 播放失败时跳转到视频首页
                        hideLoading();
                    });
                } catch (error) {
                    console.error('播放视频时出错:', error);
                    showPage('video');
                    hideLoading();
                }
                return; // 已处理，不再继续
            } else {
                console.error('找不到视频:', videoId);
                snackbar.error('找不到指定视频，可能已被删除');
                showPage('video');
                return;
            }
        }
    }

    // 处理iframe视频播放链接，支持 iframePlayer/videoId 格式
    if (hash.startsWith('iframePlayer/')) {
        const parts = hash.split('/');
        const videoId = decodeURIComponent(parts[1]); // 解码视频ID处理特殊字符

        if (videoId) {
            console.log('尝试恢复播放iframe视频:', videoId);
            // 查找视频源
            let targetVideo = null;

            // 先从收藏查找
            if (userSettings.favoriteVideos) {
                targetVideo = userSettings.favoriteVideos.find(v => v.id === videoId);
            }

            // 再从最近观看查找
            if (!targetVideo && userSettings.recentVideos) {
                targetVideo = userSettings.recentVideos.find(v => v.id === videoId);
            }

            // 再从自定义视频查找
            if (!targetVideo && userSettings.customVideos) {
                targetVideo = userSettings.customVideos.find(v => v.id === videoId);
            }

            if (targetVideo && targetVideo.playerType === 'iframe') {
                // 使用VideoManager播放iframe视频
                VideoManager.playIframeVideo(targetVideo);
                return; // 已处理，不再继续
            } else {
                console.error('找不到iframe视频:', videoId);
                snackbar.error('找不到指定视频，可能已被删除');
                showPage('video');
                return;
            }
        }
    }

    // 处理 reader 路径，支持 /reader/bookId/chapterId 格式
    if (hash.startsWith('reader/')) {
        const parts = hash.split('/');
        const bookId = parts[1];
        const chapterId = parts[2] ? parseInt(parts[2], 10) : null;

        if (bookId) {
            // 有 bookId，打开对应书籍
            openBook(bookId, chapterId);
            return; // 已处理，不再继续
        }
    }

    // 处理 library 路径，支持 /library/folderPath 格式
    if (hash.startsWith('library/')) {
        const parts = hash.split('/');

        // 处理搜索路径: library/search/keyword/page
        if (parts[1] === 'search' && parts.length >= 3) {
            lastSearchQuery = decodeURIComponent(parts[2]);

            // 如果有搜索框，更新搜索框的值
            const searchInput = document.getElementById('bookSearch');
            if (searchInput) {
                searchInput.value = lastSearchQuery;
            }

            // 检查是否有页码
            if (parts.length >= 4) {
                const page = parseInt(parts[3], 10);
                if (!isNaN(page) && page > 0) {
                    bookListPage = page;
                }
            } else {
                bookListPage = 1;
            }

            showPage('library', false);
            return;
        }

        // 处理页码路径: library/page 
        // (纯数字的第一部分被视为页码)
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            currentFolder = '';
            const page = parseInt(parts[1], 10);
            if (!isNaN(page) && page > 0) {
                bookListPage = page;
            }
            showPage('library', false);
            return;
        }

        // 处理文件夹路径: library/folder 或 library/folder/page
        const folderPath = decodeURIComponent(parts[1] || '');
        if (folderPath) {
            currentFolder = folderPath;

            // 检查是否有页码
            if (parts.length >= 3) {
                const page = parseInt(parts[2], 10);
                if (!isNaN(page) && page > 0) {
                    bookListPage = page;
                }
            } else {
                bookListPage = 1;
            }

            showPage('library', false);
            return;
        }
    }

    // 处理其他页面，确保页面存在
    if (hash && document.getElementById(hash + 'Page') && hash != 'readerChapters' && hash != 'readerSettings') {
        console.log('处理其他页面:', hash);
        showPage(hash, false); // 传递 false 防止循环更新 URL
    } else {
        showPage('library', true);
    }

}

// 新增：渲染分页组件
function renderPagination(currentPage, totalPages, totalItems) {
    const paginationNumbers = document.getElementById('paginationNumbers');
    const paginationInfo = document.getElementById('paginationInfo');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    // 更新分页信息
    paginationInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页 (${totalItems} 本书籍)`;

    // 清空分页数字
    paginationNumbers.innerHTML = '';

    // 禁用/启用上一页、下一页按钮
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    // 确定要显示的页码范围
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // 调整起始页以确保总是显示5个页码（如果有足够的页数）
    if (endPage - startPage < 4 && totalPages > 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // 添加第一页按钮（如果不是从第一页开始）
    if (startPage > 1) {
        const firstPage = document.createElement('mdui-button-icon');
        firstPage.className = 'page-number';
        firstPage.innerHTML = '<mdui-ripple></mdui-ripple>1';
        firstPage.addEventListener('click', () => goToPage(1));
        paginationNumbers.appendChild(firstPage);

        // 添加省略号（如果需要）
        if (startPage > 2) {
            const ellipsis = document.createElement('div');
            ellipsis.className = 'page-ellipsis';
            paginationNumbers.appendChild(ellipsis);
        }
    }

    // 添加中间的页码
    for (let i = startPage; i <= endPage; i++) {
        const pageNumber = document.createElement('mdui-button-icon');
        pageNumber.className = 'page-number';
        if (i === currentPage) {
            pageNumber.classList.add('active');
        }
        pageNumber.innerHTML = '<mdui-ripple></mdui-ripple>' + i;
        pageNumber.addEventListener('click', () => goToPage(i));
        paginationNumbers.appendChild(pageNumber);
    }

    // 添加最后一页按钮（如果不是到最后一页结束）
    if (endPage < totalPages) {
        // 添加省略号（如果需要）
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('div');
            ellipsis.className = 'page-ellipsis';
            paginationNumbers.appendChild(ellipsis);
        }

        const lastPage = document.createElement('mdui-button-icon');
        lastPage.className = 'page-number';
        lastPage.innerHTML = '<mdui-ripple></mdui-ripple>' + totalPages;
        lastPage.addEventListener('click', () => goToPage(totalPages));
        paginationNumbers.appendChild(lastPage);
    }
}

// 新增：跳转到指定页
async function goToPage(pageNumber) {
    if (pageNumber === bookListPage) return;

    // 保存滚动位置
    const currentScrollPosition = document.documentElement.scrollTop;
    pageScrollPositions['libraryBeforePagination'] = currentScrollPosition;

    // 更新页码
    bookListPage = pageNumber;

    // 刷新书库
    await refreshLibrary(0); // 始终滚动到顶部

    // 更新URL - 使用路径格式
    let newHash;
    if (lastSearchQuery) {
        // 如果是搜索结果的分页
        newHash = `#library/search/${encodeURIComponent(lastSearchQuery)}/${pageNumber}`;
    } else if (currentFolder) {
        // 如果是文件夹中的分页
        newHash = `#library/${encodeURIComponent(currentFolder)}/${pageNumber}`;
    } else {
        // 如果是主书库的分页
        newHash = `#library/${pageNumber}`;
    }

    history.replaceState(null, null, newHash);
}