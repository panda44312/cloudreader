// 视频功能核心模块 - VideoManager
const VideoManager = {
    // 基础设置和状态
    config: {
        AUTO_SAVE_PROGRESS_INTERVAL: 15000, // 15秒保存一次进度
        MAX_RECENT_VIDEOS: 50,
        MAX_SEARCH_RESULTS: 1000,
    },

    state: {
        currentVideo: null,
        currentEpisodeIndex: 0,
        currentPlaybackPosition: 0,
        isPlaying: false,
        progressSaveTimer: null,
        videoSources: [],
        activeFilter: 'all', // 'all', 'favorite', 'recent'
    },

    // API路径配置
    apiPaths: {
        search: '/api.php/provide/vod/?ac=videolist&wd=',
        detail: '/api.php/provide/vod/?ac=videolist&ids='
    },

    // 初始化视频功能
    init() {
        this.setupEventListeners();
        this.loadVideoData();

        // 初始化用户设置中视频相关的数据结构
        if (!userSettings.favoriteVideos) userSettings.favoriteVideos = [];
        if (!userSettings.recentVideos) userSettings.recentVideos = [];
        if (!userSettings.customVideos) userSettings.customVideos = [];
        if (!userSettings.videoProgress) userSettings.videoProgress = {};
        if (!userSettings.customVideoSources) userSettings.customVideoSources = [];

        console.log('VideoManager initialized');
    },

    // 设置事件监听
    setupEventListeners() {
        // 视频源管理按钮
        document.getElementById('manageVideoSourcesBtn')?.addEventListener('click', () => {
            this.openVideoSourcesModal();
        });

        // 添加视频按钮
        document.getElementById('addVideoBtn')?.addEventListener('click', () => {
            this.addCustomVideo();
        });

        // 视频筛选标签
        document.getElementById('allVideosBtn')?.addEventListener('click', () => {
            this.filterVideos('all');
        });

        document.getElementById('favoriteVideosBtn')?.addEventListener('click', () => {
            this.filterVideos('favorite');
        });

        document.getElementById('historyVideosBtn')?.addEventListener('click', () => {
            this.filterVideos('recent');
        });

        // 视频搜索
        const searchInput = document.getElementById('videoSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                const searchTerm = e.target.value.trim();
                this.handleSearch(searchTerm);
            }, 500));
        }

        // 视频播放器关闭按钮
        document.getElementById('closeVideoBtn')?.addEventListener('click', () => {
            this.closeVideoPlayer();
        });

        // iframe播放器关闭按钮
        document.getElementById('closeIframeBtn')?.addEventListener('click', () => {
            this.closeIframePlayer();
        });

        // 播放结束时的全局事件处理
        window.addEventListener('beforeunload', () => {
            this.saveVideoProgress();
        });

        // 监听浏览器的历史变化事件，用于处理后退按钮事件
        window.addEventListener('popstate', (e) => {
            const hash = window.location.hash.substring(1);
            // 如果从视频播放页面返回，暂停视频并保存进度
            if (hash !== 'videoPlayer' && hash !== 'iframePlayer') {
                // 如果当前正在播放直接视频
                const videoPlayer = document.getElementById('customVideoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    this.saveVideoProgress();
                }

                // 如果当前正在播放iframe视频，清除iframe源
                const iframePlayer = document.getElementById('iframePlayerFrame');
                if (iframePlayer && iframePlayer.src !== 'about:blank') {
                    iframePlayer.src = 'about:blank';
                }
            }
        });

        // 监听hash变化，用于处理URL直接修改和应用内导航
        window.addEventListener('hashchange', (e) => {
            const hash = window.location.hash.substring(1);
            // 如果URL不再是视频播放相关页面，暂停视频
            if (!hash.startsWith('videoPlayer') && !hash.startsWith('iframePlayer')) {
                // 如果当前正在播放直接视频
                const videoPlayer = document.getElementById('customVideoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    this.saveVideoProgress();
                }

                // 如果当前正在播放iframe视频，清除iframe源
                const iframePlayer = document.getElementById('iframePlayerFrame');
                if (iframePlayer && iframePlayer.src !== 'about:blank') {
                    iframePlayer.src = 'about:blank';
                }
            }
        });
    },

    // 加载视频数据
    loadVideoData() {
        this.renderVideosList(this.state.activeFilter);
    },

    // 过滤视频列表
    filterVideos(filterType) {
        this.state.activeFilter = filterType;

        // 更新UI状态
        const allBtn = document.getElementById('allVideosBtn');
        const favoriteBtn = document.getElementById('favoriteVideosBtn');
        const historyBtn = document.getElementById('historyVideosBtn');

        if (allBtn) allBtn.removeAttribute('selected');
        if (favoriteBtn) favoriteBtn.removeAttribute('selected');
        if (historyBtn) historyBtn.removeAttribute('selected');

        if (filterType === 'all' && allBtn) allBtn.setAttribute('selected', '');
        if (filterType === 'favorite' && favoriteBtn) favoriteBtn.setAttribute('selected', '');
        if (filterType === 'recent' && historyBtn) historyBtn.setAttribute('selected', '');

        // 渲染视频列表
        this.renderVideosList(filterType);
    },

    // 搜索视频处理
    handleSearch(searchTerm) {
        if (!searchTerm) {
            // 当搜索框清空时恢复原始视图
            this.renderVideosList(this.state.activeFilter);
            return;
        }

        // 现在只处理本地搜索
        this.searchLocalVideos(searchTerm);
    },

    // 搜索本地添加的视频
    searchLocalVideos(searchTerm) {
        const container = document.getElementById('videoResultsContainer');
        if (!container) return;

        // 获取所有可能的视频源
        let allVideos = [];

        // 添加收藏和播放历史（去重）
        if (userSettings.favoriteVideos) {
            userSettings.favoriteVideos.forEach(video => {
                if (!allVideos.some(v => v.id === video.id)) {
                    allVideos.push(video);
                }
            });
        }

        if (userSettings.recentVideos) {
            userSettings.recentVideos.forEach(video => {
                if (!allVideos.some(v => v.id === video.id)) {
                    allVideos.push(video);
                }
            });
        }

        // 添加自定义视频
        if (userSettings.customVideos && userSettings.customVideos.length > 0) {
            userSettings.customVideos.forEach(video => {
                if (!allVideos.some(v => v.id === video.id)) {
                    allVideos.push(video);
                }
            });
        }

        // 过滤匹配的视频
        const searchTermLower = searchTerm.toLowerCase();
        const matchedVideos = allVideos.filter(video => {
            const title = (video.title || video.vod_name || '').toLowerCase();
            const source = (video.source || video.sourceName || '').toLowerCase();
            return title.includes(searchTermLower) || source.includes(searchTermLower);
        });

        // 渲染搜索结果
        this.renderSearchResults(matchedVideos, `搜索"${searchTerm}"的结果`);
    },

    // 远程API搜索视频
    async searchRemoteVideos(searchTerm, containerId = 'videoResultsContainer') {
        showLoading('正在搜索视频...');
        const videoResultsContainer = document.getElementById(containerId);
        videoResultsContainer.innerHTML = '';

        if (!userSettings.customVideoSources || userSettings.customVideoSources.length === 0) {
            hideLoading();
            snackbar.info('请先在"管理视频源"中添加视频源');
            videoResultsContainer.innerHTML = '<div class="empty-state"><p>请添加视频源后进行搜索</p><mdui-button id="addSourceFromEmptyBtn" variant="tonal" icon="add">添加视频源</mdui-button></div>';

            document.getElementById('addSourceFromEmptyBtn')?.addEventListener('click', () => {
                this.openVideoSourcesModal();
            });
            return;
        }

        try {
            const allResults = [];
            const sources = userSettings.customVideoSources;
            let hasErrors = false;

            for (const source of sources) {
                if (!source.url || !source.name) continue;

                try {
                    const encodedSearchTerm = encodeURIComponent(searchTerm);
                    const baseUrl = source.url.replace(/\/+$/, "");
                    const targetUrl = baseUrl + this.apiPaths.search + encodedSearchTerm;
                    const proxyEndpoint = `/videoproxy/get?target=${encodeURIComponent(targetUrl)}`;

                    console.log(`Searching source: ${source.name}, Target URL: ${targetUrl}`);

                    const data = await ApiService.call(proxyEndpoint, 'GET');

                    if (data && data.list && Array.isArray(data.list)) {
                        // 应用筛选规则
                        const filteredItems = this.applySourceFilters(data.list, source.filters);

                        filteredItems.forEach(item => {
                            if (!item || !item.vod_id) return;

                            // 生成唯一ID避免重复
                            const videoId = `api_${source.name.replace(/\s+/g, '_')}_${item.vod_id}`;

                            // 添加额外信息
                            allResults.push({
                                ...item,
                                id: videoId,
                                sourceName: source.name,
                                sourceUrl: source.url,
                                source: source.name,
                                thumbnail: item.vod_pic || this.config.DEFAULT_THUMBNAIL,
                                episodeCount: this.extractEpisodeCount(item)
                            });
                        });
                    } else {
                        console.warn(`Source ${source.name} did not return valid data`);
                        hasErrors = true;
                    }
                } catch (error) {
                    console.error(`Error searching source ${source.name}:`, error);
                    hasErrors = true;
                }
            }

            hideLoading();

            if (allResults.length > 0) {
                // 根据containerId判断是主页面搜索还是弹窗内搜索
                if (containerId === 'apiSearchResultsContainer') {
                    // 在弹窗内显示搜索结果
                    this.renderApiSearchResults(allResults, videoResultsContainer, `搜索"${searchTerm}"的结果`);
                } else {
                    // 原始搜索结果显示
                    this.renderSearchResults(allResults, `API搜索"${searchTerm}"的结果`, true);
                }

                if (hasErrors) {
                    snackbar.info('部分视频源返回错误，结果可能不完整');
                }
            } else {
                videoResultsContainer.innerHTML = '<div class="empty-state"><p>未找到相关视频</p></div>';

                if (hasErrors) {
                    snackbar.error('搜索时发生错误，请检查视频源');
                }
            }

        } catch (error) {
            hideLoading();
            console.error('视频搜索出错:', error);
            snackbar.error('搜索视频时出错');
            videoResultsContainer.innerHTML = '<div class="empty-state"><p>搜索出错</p></div>';
        }
    },

    // 应用视频源筛选规则
    applySourceFilters(videoItems, filters) {
        if (!filters || !videoItems || !Array.isArray(videoItems)) {
            return videoItems;
        }

        let filteredItems = [...videoItems];

        // 应用分类筛选
        if (filters.classes && filters.classes.values && filters.classes.values.length > 0) {
            const classMode = filters.classes.mode || 'exclude';
            const classValues = filters.classes.values;
            filteredItems = filteredItems.filter(item => {

                // 优先使用 vod_class，如果为空则使用 vod_tag
                const rawClassString = item.vod_class || item.vod_tag || item.type_name || '';

                // 解析视频分类
                const videoClasses = this.parseVideoClasses(rawClassString);

                // 分类检查匹配
                const hasMatchingClass = this.hasMatchingClass(videoClasses, classValues);

                // 根据模式决定是保留还是排除
                if (classMode === 'exclude') {
                    return !hasMatchingClass; // 排除模式：不包含匹配分类的保留
                } else {
                    return hasMatchingClass; // 包含模式：包含匹配分类的保留
                }
                
            });

        }

        return filteredItems;
    },

    // 解析视频分类字符串为数组
    parseVideoClasses(classString) {
        if (!classString) return [];

        // 处理不同的分隔符
        return classString
            .split(/[,，、;；\s]+/) // 支持多种分隔符
            .map(c => c.trim())
            .filter(c => c); // 移除空值
    },

    // 检查视频分类是否匹配筛选规则
    hasMatchingClass(videoClasses, filterClasses) {
        if (!videoClasses.length || !filterClasses.length) return false;

        // 检查是否有交集
        for (const videoClass of videoClasses) {
            for (const filterClass of filterClasses) {
                if (videoClass.toLowerCase() === filterClass.toLowerCase()) {
                    return true;
                }
            }
        }

        return false;
    },

    // 在弹窗中渲染API搜索结果
    renderApiSearchResults(results, container, title = '搜索结果') {
        if (!container) return;

        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>未找到相关视频</p></div>';
            return;
        }

        // 创建网格容器
        const grid = document.createElement('div');
        grid.className = 'video-grid api-search-grid'; // 可以保留此特定class用于样式调整
        

        // 限制结果数量
        const maxResults = this.config.MAX_SEARCH_RESULTS;
        const resultsToShow = results.slice(0, maxResults);

        resultsToShow.forEach(video => {

            const isInMyVideos = userSettings.customVideos?.some(v => v.id === video.id) || false;

            // 调用 this.createVideoCard 来创建卡片
            // 参数: video对象, isFavorite (API搜索结果通常不是收藏状态), isApiSearch (true), isInMyVideos
            const card = this.createVideoCard(video, false, true, isInMyVideos);

            card.classList.add('api-search-card'); // 用于可能的特定样式

            grid.appendChild(card);
        });

        container.appendChild(grid);

        if (results.length > maxResults) {
            const moreInfo = document.createElement('p');
            moreInfo.textContent = `显示前 ${maxResults} 个结果，共找到 ${results.length} 个结果`;
            container.appendChild(moreInfo);
        }
        
        let macy = Macy({
            container: grid,
            columns: 5, // 默认列数，近似模拟 auto-fill
            breakAt: {
              1200: 4,
              900: 3,
              600: 2  // 小于 600px 时强制 2 列
            },
            margin: 8,
          });

    },

    // 提取视频中的集数信息
    extractEpisodeCount(videoItem) {
        if (videoItem.vod_remarks && typeof videoItem.vod_remarks === 'string') {
            // 尝试从备注中提取集数信息
            const episodeMatch = videoItem.vod_remarks.match(/第?(\d+)[集话部]/);
            if (episodeMatch) {
                return parseInt(episodeMatch[1]);
            }

            // 尝试匹配"更新至xx集"格式
            const updateMatch = videoItem.vod_remarks.match(/更新至(\d+)[集话部]/);
            if (updateMatch) {
                return parseInt(updateMatch[1]);
            }

            // 尝试匹配纯数字+集/话/部
            const numMatch = videoItem.vod_remarks.match(/(\d+)[集话部]/);
            if (numMatch) {
                return parseInt(numMatch[1]);
            }
        }

        return null; // 无法提取集数信息
    },

    // 渲染搜索结果
    renderSearchResults(results, title = '搜索结果', isApiSearch = false) {
        const container = document.getElementById('videoResultsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>未找到相关视频</p></div>';
            return;
        }

        // 创建网格容器
        const grid = document.createElement('div');
        grid.className = 'video-grid';

        // 限制结果数量
        const maxResults = this.config.MAX_SEARCH_RESULTS;
        const resultsToShow = results.slice(0, maxResults);

        resultsToShow.forEach(video => {
            const isFavorite = userSettings.favoriteVideos?.some(v => v.id === video.id) || false;
            const isInMyVideos = userSettings.customVideos?.some(v => v.id === video.id) || false;

            // 创建视频卡片时传入额外参数
            const card = this.createVideoCard(video, isFavorite, isApiSearch, isInMyVideos);
            grid.appendChild(card);
        });

        container.appendChild(grid);

        if (results.length > maxResults) {
            const moreInfo = document.createElement('p');
            moreInfo.textContent = `显示前 ${maxResults} 个结果，共找到 ${results.length} 个结果`;
            container.appendChild(moreInfo);
        }

        let macy = Macy({
            container: grid,
            columns: 3, // 默认列数，近似模拟 auto-fill
            breakAt: {
              1200: 3,
              900: 2,
              600: 1
            },
            margin: 8,
          });
    },

    // 渲染视频列表
    renderVideosList(type = 'all') {
        const container = document.getElementById('videoResultsContainer');
        if (!container) return;

        container.innerHTML = '';

        let videos = [];
        let emptyMessage = '';

        switch (type) {
            case 'favorite':
                videos = userSettings.favoriteVideos || [];
                emptyMessage = '还没有收藏任何视频';
                break;

            case 'recent':
                videos = [...(userSettings.recentVideos || [])];
                videos.sort((a, b) => b.lastWatched - a.lastWatched);
                emptyMessage = '还没有观看记录';
                break;

            case 'all':
            default:
                // 添加收藏和历史（去重）
                if (userSettings.favoriteVideos) {
                    userSettings.favoriteVideos.forEach(video => {
                        if (!videos.some(v => v.id === video.id)) {
                            videos.push(video);
                        }
                    });
                }

                if (userSettings.recentVideos) {
                    userSettings.recentVideos.forEach(video => {
                        if (!videos.some(v => v.id === video.id)) {
                            videos.push(video);
                        }
                    });
                }

                // 自定义视频
                if (userSettings.customVideos && userSettings.customVideos.length > 0) {
                    userSettings.customVideos.forEach(video => {
                        if (!videos.some(v => v.id === video.id)) {
                            videos.push(video);
                        }
                    });
                }

                emptyMessage = '还没有添加任何视频';
                break;
        }

        if (videos.length === 0) {
            container.innerHTML = `
          <div class="empty-state">
            <p>${emptyMessage}</p>
            ${type === 'all' ? '<mdui-button id="emptyAddVideoBtn" variant="tonal" icon="add">添加视频</mdui-button>' : ''}
          </div>
        `;

            document.getElementById('emptyAddVideoBtn')?.addEventListener('click', () => {
                this.addCustomVideo();
            });

            return;
        }

        // 创建网格容器
        const grid = document.createElement('div');
        grid.className = 'video-grid';
        
        videos.forEach(video => {
            const isFavorite = userSettings.favoriteVideos?.some(v => v.id === video.id) || false;
            const card = this.createVideoCard(video, isFavorite);
            grid.appendChild(card);
        });

        container.appendChild(grid);

        let macy = Macy({
            container: grid,
            columns: 5, // 默认列数，近似模拟 auto-fill
            breakAt: {
              1200: 4,
              900: 3,
              600: 2  // 小于 600px 时强制 2 列
            },
            margin: 8,
          });
    },

    // 创建视频卡片
    createVideoCard(video, isFavorite, isApiSearch = false, isInMyVideos = false) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = video.id;

        // 获取视频缩略图
        const thumbnail = video.thumbnail || video.vod_pic || null;

        // 获取视频来源名称
        const sourceName = video.source || video.sourceName || '未知来源';

        // 获取集数信息
        const episodeCount = video.episodeCount ||
            (video.vod_remarks && video.vod_remarks.match(/\d+/) ?
                video.vod_remarks : null);

        // 构建卡片HTML
        card.innerHTML = `
        <div class="video-card-cover">
          ${thumbnail ?
                `<img src="${API_URL}/videoproxy/get?target=${encodeURIComponent(thumbnail)}" 
                   alt="${video.title || video.vod_name || '视频'}" 
                   onload="this.classList.add('loaded')">` :
                `<div class="video-card-default-icon">
                 <mdui-icon name="play_circle"></mdui-icon>
               </div>`
            }
          
          <div class="video-card-actions">
            ${isApiSearch ?
                `<mdui-button variant="filled" class="add-to-my-videos-btn" ${isInMyVideos ? 'disabled' : ''}>
                ${isInMyVideos ? '已添加' : '添加'}
              </mdui-button>` :
                `<mdui-button-icon class="video-card-favorite-btn" icon="${isFavorite ? 'favorite--outlined' : 'favorite'}" 
                                style="color: ${isFavorite ? '#ff4081' : 'white'}"></mdui-button-icon>
               <mdui-button-icon class="video-card-delete-btn" icon="delete"></mdui-button-icon>`
            }
          </div>
          
          ${episodeCount ?
                `<div class="video-card-badge">
              ${typeof episodeCount === 'number' ? `${episodeCount}集` : episodeCount}
             </div>` : ''}
        </div>
        
        <div class="video-card-info">
          <h3 class="video-card-title">${video.title || video.vod_name || '未命名视频'}</h3>
          <div class="video-card-details">
            <span class="video-card-source">${sourceName}</span>
            ${video.vod_year ? `<span class="video-card-year">${video.vod_year}</span>` : ''}
          </div>
        </div>
      `;

        // 点击卡片播放视频事件
        card.addEventListener('click', (e) => {
            // 避免点击按钮时触发卡片点击事件
            if (e.target.closest('.video-card-actions') ||
                e.target.closest('.add-to-my-videos-btn') ||
                e.target.closest('.video-card-favorite-btn') ||
                e.target.closest('.video-card-delete-btn')) {
                return;
            }

            if (isApiSearch) {
                // API搜索结果点击卡片也应该添加到我的视频
                this.addVideoFromApiSearch(video);
            } else {
                // 播放视频
                if (video.type === 'custom' && video.url) {
                    this.playCustomVideo(video);
                } else if (video.vod_id) {
                    // 检查是否有保存的进度，并恢复到上次观看的集数
                    const videoId = video.id || video.vod_id;
                    const savedProgress = userSettings.videoProgress?.[videoId];

                    if (savedProgress && typeof savedProgress.episodeIndex === 'number') {
                        console.log(`恢复到上次观看的第${savedProgress.episodeIndex + 1}集`);
                        this.playVideoItem(video, savedProgress.episodeIndex);
                    } else {
                        // 没有保存的进度，从第1集开始播放
                        this.playVideoItem(video, 0);
                    }
                }

                // 添加到最近观看
                this.addToRecentVideos(video);
            }
        });

        // API搜索模式下的添加按钮
        if (isApiSearch) {
            const addBtn = card.querySelector('.add-to-my-videos-btn');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.addVideoFromApiSearch(video);

                    // 更新UI状态
                    addBtn.disabled = true;
                    addBtn.textContent = '已添加';
                });
            }
        } else {
            // 收藏按钮事件
            const favoriteBtn = card.querySelector('.video-card-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleVideoFavorite(video.id);

                    // 更新UI
                    const isNowFavorite = userSettings.favoriteVideos?.some(v => v.id === video.id) || false;
                    favoriteBtn.icon = isNowFavorite ? 'favorite--outlined' : 'favorite';
                    favoriteBtn.style.color = isNowFavorite ? '#ff4081' : 'white';
                });
            }

            // 删除按钮事件
            const deleteBtn = card.querySelector('.video-card-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmed = await ModalManager.confirm(`确定要删除视频 "${video.title || video.vod_name || '未命名视频'}" 吗？`);

                    if (confirmed) {
                        this.deleteVideo(video.id);
                    }
                });
            }
        }

        return card;
    },

    // 从API搜索结果添加视频
    addVideoFromApiSearch(video) {
        // 检查视频是否已经添加
        if (userSettings.customVideos?.some(v => v.id === video.id)) {
            snackbar.info('该视频已添加到你的视频列表');
            return;
        }

        // 准备视频数据
        const videoToAdd = {
            id: video.id,
            title: video.vod_name || video.title || '未命名视频',
            vod_id: video.vod_id,
            sourceUrl: video.sourceUrl,
            sourceName: video.source || video.sourceName,
            thumbnail: video.vod_pic || video.thumbnail,
            addedDate: Date.now(),
            // 复制其他必要属性
            ...video
        };

        // 添加到自定义视频列表
        if (!userSettings.customVideos) {
            userSettings.customVideos = [];
        }

        userSettings.customVideos.push(videoToAdd);
        UserManager.saveSettings();

        // 添加视频后刷新列表视图
        this.renderVideosList(this.state.activeFilter);

        snackbar.success('视频已添加到你的列表');
    },

    // 删除视频
    deleteVideo(videoId) {
        // 从自定义视频中删除
        if (userSettings.customVideos) {
            const customIndex = userSettings.customVideos.findIndex(v => v.id === videoId);
            if (customIndex !== -1) {
                userSettings.customVideos.splice(customIndex, 1);
            }
        }

        // 从收藏中删除
        if (userSettings.favoriteVideos) {
            const favoriteIndex = userSettings.favoriteVideos.findIndex(v => v.id === videoId);
            if (favoriteIndex !== -1) {
                userSettings.favoriteVideos.splice(favoriteIndex, 1);
            }
        }

        // 从历史记录中删除
        if (userSettings.recentVideos) {
            const recentIndex = userSettings.recentVideos.findIndex(v => v.id === videoId);
            if (recentIndex !== -1) {
                userSettings.recentVideos.splice(recentIndex, 1);
            }
        }

        // 从进度记录中删除
        if (userSettings.videoProgress && userSettings.videoProgress[videoId]) {
            delete userSettings.videoProgress[videoId];
        }

        // 保存更改
        UserManager.saveSettings();

        // 重新渲染当前视图
        this.renderVideosList(this.state.activeFilter);

        snackbar.success('视频已删除');
    },

    // 添加视频到最近观看
    addToRecentVideos(video) {
        if (!userSettings.recentVideos) {
            userSettings.recentVideos = [];
        }

        // 如果已经在列表中，先移除
        const index = userSettings.recentVideos.findIndex(v => v.id === video.id);
        if (index !== -1) {
            userSettings.recentVideos.splice(index, 1);
        }

        // 添加到最前面并更新时间戳
        const videoWithTimestamp = {
            ...video,
            lastWatched: Date.now()
        };

        userSettings.recentVideos.unshift(videoWithTimestamp);

        // 限制最多保存的记录数
        if (userSettings.recentVideos.length > this.config.MAX_RECENT_VIDEOS) {
            userSettings.recentVideos = userSettings.recentVideos.slice(
                0, this.config.MAX_RECENT_VIDEOS
            );
        }

        UserManager.saveSettings();
    },

    // 切换视频收藏状态
    toggleVideoFavorite(videoId) {
        if (!userSettings.favoriteVideos) {
            userSettings.favoriteVideos = [];
        }

        const index = userSettings.favoriteVideos.findIndex(v => v.id === videoId);

        // 查找视频完整信息
        let videoInfo = null;

        // 在所有可能来源中查找
        if (userSettings.customVideos) {
            videoInfo = userSettings.customVideos.find(v => v.id === videoId);
        }

        if (!videoInfo && userSettings.recentVideos) {
            videoInfo = userSettings.recentVideos.find(v => v.id === videoId);
        }

        if (index !== -1) {
            // 已收藏则取消
            userSettings.favoriteVideos.splice(index, 1);
        } else if (videoInfo) {
            // 未收藏则添加
            userSettings.favoriteVideos.push(videoInfo);
        } else {
            snackbar.error('找不到视频信息');
            return;
        }

        UserManager.saveSettings();

        // 如果当前在收藏页面，刷新列表
        if (this.state.activeFilter === 'favorite') {
            this.renderVideosList('favorite');
        }
    },

    // 添加自定义视频
    addCustomVideo() {
        const modalContent = `
        <div class="add-video-form">
            <div class="add-video-types">
                <div class="add-video-type active" data-type="iframe">
                    <mdui-icon name="language"></mdui-icon>
                    <span>网页视频</span>
                </div>
                <div class="add-video-type" data-type="api">
                    <mdui-icon name="search"></mdui-icon>
                    <span>搜索视频</span>
                </div>
            </div>
            
            <div class="modal-content modal-body">
                <!-- 普通添加视频表单 -->
                <div id="normalVideoInputs">
                    <mdui-text-field id="videoTitle" variant="outlined" label="视频标题" class="form-input" required></mdui-text-field>
                    
                    <div id="iframeUrlInput">
                        <mdui-text-field id="videoIframeUrl" variant="outlined" label="视频网页链接" class="form-input" 
                                        placeholder="粘贴视频网页链接" required></mdui-text-field>
                    </div>
                </div>
                
                <!-- API搜索视频表单 -->
                <div id="apiSearchInputs" class="hidden">
                    <div class="api-search-container">
                        <mdui-text-field id="apiSearchInput" variant="outlined" label="搜索视频" class="form-input"
                                        placeholder="输入关键词搜索视频">
                            <mdui-button-icon  slot="end-icon" id="apiSearchBtn" icon="search"></mdui-button-icon>
                        </mdui-text-field>
                    </div>
                    
                    <div id="apiSearchResultsContainer" class="api-search-results-container">
                        <!-- 搜索结果将在这里显示 -->
                    </div>
                </div>
            </div>
            
        </div>
    `;

        const modal = ModalManager.createModal('add-custom-video-modal', '添加视频', modalContent, {
            confirmText: '添加',
            cancelText: '取消'
        });

        ModalManager.show('add-custom-video-modal', {
            afterShow: () => {
                // 视频类型切换
                const types = document.querySelectorAll('.add-video-type');
                const normalInputs = document.getElementById('normalVideoInputs');
                const apiInputs = document.getElementById('apiSearchInputs');

                types.forEach(type => {
                    type.addEventListener('click', () => {
                        types.forEach(t => t.classList.remove('active'));
                        type.classList.add('active');

                        const typeValue = type.dataset.type;
                        if (typeValue === 'iframe') {
                            normalInputs.classList.remove('hidden');
                            apiInputs.classList.add('hidden');
                        } else if (typeValue === 'api') {
                            normalInputs.classList.add('hidden');
                            apiInputs.classList.remove('hidden');
                        }
                    });
                });

                // API搜索按钮事件
                const apiSearchBtn = document.getElementById('apiSearchBtn');
                const apiSearchInput = document.getElementById('apiSearchInput');

                apiSearchBtn.addEventListener('click', () => {
                    const searchTerm = apiSearchInput.value.trim();
                    this.searchRemoteVideos(searchTerm, 'apiSearchResultsContainer');
                });

                // 回车键触发搜索
                apiSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        apiSearchBtn.click();
                    }
                });

            },

            confirm: async () => {
                // 获取当前活动类型
                const activeType = document.querySelector('.add-video-type.active')?.dataset.type;

                // API搜索模式不需要验证表单，直接关闭
                if (activeType === 'api') {
                    return true; // 允许关闭
                }

                // 获取输入内容
                const title = document.getElementById('videoTitle')?.value.trim();
                const url = document.getElementById('videoIframeUrl')?.value.trim();

                if (!title || !url) {
                    snackbar.error('请填写视频标题和链接');
                    return false; // 阻止关闭
                }

                // 保存视频
                if (!userSettings.customVideos) {
                    userSettings.customVideos = [];
                }

                const videoId = `video_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                const videoObj = {
                    id: videoId,
                    title,
                    url,
                    type: 'custom',
                    playerType: 'iframe', // 现在只有iframe类型
                    source: '视频',
                    addedDate: Date.now()
                };

                userSettings.customVideos.push(videoObj);
                await UserManager.saveSettings();

                // 刷新列表
                this.renderVideosList(this.state.activeFilter);

                snackbar.success('视频已添加');
                return true; // 允许关闭
            }
        });
    },
    // 管理视频源
    openVideoSourcesModal() {
        const modalId = 'videoSourcesModal';

        const modalContent = `
        <div id="currentVideoSourcesList" class="video-sources-list-container"></div>
        
        <form id="addVideoSourceForm" class="mt-4">
          <mdui-text-field id="newVideoSourceName" variant="outlined" label="视频源名称" required></mdui-text-field>
          <mdui-text-field id="newVideoSourceUrl" variant="outlined" label="视频源API地址 (json)" required></mdui-text-field>
          <mdui-button type="submit" variant="filled" icon="add">添加源</mdui-button>
        </form>
      `;

        const modal = ModalManager.createModal(modalId, '管理视频源', modalContent, {
            confirmText: '完成',
            cancelText: '关闭'
        });

        ModalManager.show(modalId, {
            afterShow: () => {
                this.renderVideoSourcesList();

                const addForm = document.getElementById('addVideoSourceForm');
                if (addForm) {
                    addForm.addEventListener('submit', async (e) => {
                        e.preventDefault();

                        const nameInput = document.getElementById('newVideoSourceName');
                        const urlInput = document.getElementById('newVideoSourceUrl');
                        const name = nameInput.value.trim();
                        const url = urlInput.value.trim();

                        if (!name || !url) {
                            snackbar.error('名称和API地址不能为空');
                            return;
                        }

                        if (!userSettings.customVideoSources) {
                            userSettings.customVideoSources = [];
                        }

                        // 检查重复
                        if (userSettings.customVideoSources.some(source => source.url === url)) {
                            snackbar.error('该视频源API地址已存在');
                            return;
                        }

                        // 初始化空的筛选规则
                        userSettings.customVideoSources.push({
                            name,
                            url,
                            filters: {
                                classes: {
                                    mode: "exclude",
                                    values: []
                                }
                            }
                        });
                        await UserManager.saveSettings();

                        snackbar.success('视频源已添加');
                        nameInput.value = '';
                        urlInput.value = '';

                        this.renderVideoSourcesList();
                    });
                }
            },

            confirm: () => {
                ModalManager.hide(modalId);
            },

            cancel: () => {
                ModalManager.hide(modalId);
            }
        });
    },

    // 渲染视频源列表
    renderVideoSourcesList() {
        const listContainer = document.getElementById('currentVideoSourcesList');
        if (!listContainer) return;

        if (!userSettings.customVideoSources || userSettings.customVideoSources.length === 0) {
            listContainer.innerHTML = '<p>还没有添加任何视频源</p>';
            return;
        }

        listContainer.innerHTML = '';
        const ul = document.createElement('div');
        ul.className = 'flex';

        userSettings.customVideoSources.forEach((source, index) => {
            // 确保filters对象存在
            if (!source.filters) {
                source.filters = {
                    classes: {
                        mode: "exclude",
                        values: []
                    }
                };
            }

            // 构建分类过滤器的字符串显示
            let filterDisplay = '';
            if (source.filters.classes && source.filters.classes.values && source.filters.classes.values.length > 0) {
                const mode = source.filters.classes.mode === 'exclude' ? '排除' : '仅包含';
                filterDisplay = `<div class="source-filter-info">
                <span class="filter-badge">${mode}分类:</span>
                ${source.filters.classes.values.join(', ')}
            </div>`;
            }

            const listItem = document.createElement('div');
            listItem.className = 'source-list-item';
            listItem.innerHTML = `
            <div class="source-list-content">
                <div class="source-name">${source.name}</div>
                <div class="source-url">${source.url}</div>
                ${filterDisplay}
            </div>
            <div class="source-list-actions">
                <mdui-button-icon icon="arrow_upward" class="move-source-up-btn" title="上移" data-index="${index}" ${index === 0 ? 'disabled' : ''}></mdui-button-icon>
                <mdui-button-icon icon="arrow_downward" class="move-source-down-btn" title="下移" data-index="${index}" ${index === userSettings.customVideoSources.length - 1 ? 'disabled' : ''}></mdui-button-icon>
                <mdui-button-icon icon="filter_list" class="edit-source-filter-btn" title="编辑筛选" data-index="${index}"></mdui-button-icon>
                <mdui-button-icon icon="delete" class="delete-video-source-btn" title="删除" data-index="${index}"></mdui-button-icon>
            </div>
        `;
            ul.appendChild(listItem);
        });

        listContainer.appendChild(ul);

        // 上移按钮事件
        listContainer.querySelectorAll('.move-source-up-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const indexToMove = parseInt(e.currentTarget.getAttribute('data-index'));
                this.moveVideoSource(indexToMove, 'up');
            });
        });

        // 下移按钮事件
        listContainer.querySelectorAll('.move-source-down-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const indexToMove = parseInt(e.currentTarget.getAttribute('data-index'));
                this.moveVideoSource(indexToMove, 'down');
            });
        });

        // 删除按钮事件
        listContainer.querySelectorAll('.delete-video-source-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const indexToDelete = parseInt(e.currentTarget.getAttribute('data-index'));
                const sourceNameToDelete = userSettings.customVideoSources[indexToDelete]?.name;

                const confirmed = await ModalManager.confirm(
                    `确定要删除视频源 "${sourceNameToDelete || '该源'}" 吗？`
                );

                if (confirmed) {
                    userSettings.customVideoSources.splice(indexToDelete, 1);
                    await UserManager.saveSettings();

                    snackbar.success('视频源已删除');
                    this.renderVideoSourcesList();
                }
            });
        });

        // 编辑筛选规则按钮事件
        listContainer.querySelectorAll('.edit-source-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                this.openFilterSettingsModal(index);
            });
        });
    },

    // 新增：移动视频源顺序的方法
    moveVideoSource(index, direction) {
        if (!userSettings.customVideoSources || userSettings.customVideoSources.length < 2) {
            return; // 不需要移动
        }

        const sources = userSettings.customVideoSources;
        const sourceToMove = sources[index];

        if (direction === 'up' && index > 0) {
            // 上移
            sources.splice(index, 1); // 移除元素
            sources.splice(index - 1, 0, sourceToMove); // 插入到新位置
        } else if (direction === 'down' && index < sources.length - 1) {
            // 下移
            sources.splice(index, 1); // 移除元素
            sources.splice(index + 1, 0, sourceToMove); // 插入到新位置
        } else {
            return; // 无法移动 (已经是顶部或底部)
        }

        UserManager.saveSettings().then(() => {
            this.renderVideoSourcesList(); // 重新渲染列表以反映顺序变化
        }).catch(err => {
            console.error('保存视频源顺序失败', err);
            snackbar.error('更新顺序失败');
        });
    },

    // 打开分类筛选设置弹窗
    openFilterSettingsModal(sourceIndex) {
        const source = userSettings.customVideoSources[sourceIndex];
        if (!source) return;

        // 确保filters对象存在
        if (!source.filters) {
            source.filters = {
                classes: {
                    mode: "exclude",
                    values: []
                }
            };
        }

        const modalId = 'filterSettingsModal';
        const modalContent = `
        <div class="filter-settings-form">
            <div class="filter-section">
                <h3>分类筛选</h3>
                
                <mdui-radio-group class="filter-mode-selector" value="${source.filters.classes.mode === 'exclude' ? 'checked' : 'include'}">
                    <mdui-radio id="excludeMode" name="classMode" value="exclude" 
                        ${source.filters.classes.mode === 'exclude' ? 'checked' : ''}>
                        排除以下分类
                    </mdui-radio>
                    <mdui-radio id="includeMode" name="classMode" value="include"
                        ${source.filters.classes.mode === 'include' ? 'checked' : ''}>
                        仅包含以下分类
                    </mdui-radio>
                </mdui-radio-group>
                
                <div class="filter-values-container">
                    <mdui-text-field id="classFilterValues" variant="outlined" 
                        label="分类列表 (多个用逗号分隔)" class="form-input"
                        value="${source.filters.classes.values.join(',')}">
                    </mdui-text-field>
                </div>
                
                <div class="filter-help-text">
                    <p>分类筛选将在搜索结果中应用，可以帮助你过滤不需要的内容类型。</p>
                </div>
            </div>
        </div>
    `;

        const modal = ModalManager.createModal(modalId, `${source.name} 筛选设置`, modalContent, {
            confirmText: '保存',
            cancelText: '取消'
        });

        ModalManager.show(modalId, {
            confirm: async () => {
                try {

                    // 获取筛选模式
                    const modeRadios = document.getElementsByName('classMode');
                    let selectedMode = 'exclude';
                    for (const radio of modeRadios) {
                        if (radio.checked) {
                            selectedMode = radio.value;
                            break;
                        }
                    }

                    // 获取分类值
                    const classValuesInput = document.getElementById('classFilterValues');
                    let classValues = [];
                    if (classValuesInput && classValuesInput.value.trim()) {
                        // 分割输入的分类值，处理不同的分隔符情况
                        classValues = classValuesInput.value
                            .split(/[,，、;；\s]+/) // 支持多种分隔符
                            .map(v => v.trim())
                            .filter(v => v); // 移除空值
                    }

                    // 更新筛选规则
                    source.filters.classes = {
                        mode: selectedMode,
                        values: classValues
                    };

                    await UserManager.saveSettings();

                    // 刷新视频源列表
                    this.renderVideoSourcesList();

                    snackbar.success('筛选设置已保存');
                } catch (error) {
                    console.error('保存筛选设置时出错:', error);
                    snackbar.error('保存设置失败');
                }

                // 无论成功还是失败，都关闭弹窗
                ModalManager.hide(modalId);
                return true; // 明确返回true允许关闭
            },

            cancel: () => {
                ModalManager.hide(modalId); // 主动调用hide方法
                return true; // 明确返回true允许关闭
            }
        });
    },

    // 播放自定义视频
    playCustomVideo(video) {
        if (!video || !video.url) {
            snackbar.error('无效的视频链接');
            return;
        }

        // 检查是否有保存的进度
        const savedProgress = userSettings.videoProgress?.[video.id];
        console.log(`检查视频${video.id}的保存进度:`, savedProgress);

        // 现在只有iframe一种播放方式
        this.playIframeVideo(video);

        // 添加到最近观看
        this.addToRecentVideos(video);
    },

    // 播放Iframe嵌入视频
    playIframeVideo(video) {
        const iframePlayerPage = document.getElementById('iframePlayer');
        const iframePlayerTitle = document.getElementById('iframePlayerTitle');
        const iframePlayerFrame = document.getElementById('iframePlayerFrame');
        const toggleFavoriteBtn = document.getElementById('toggleIframeFavoriteBtn');

        // 设置标题和来源
        iframePlayerTitle.textContent = video.title || '网页视频';
        iframePlayerFrame.src = video.url;

        // 更新收藏按钮状态
        const isFavorite = userSettings.favoriteVideos?.some(v => v.id === video.id) || false;
        toggleFavoriteBtn.icon = isFavorite ? 'favorite--outlined' : 'favorite';

        // 收藏按钮事件
        toggleFavoriteBtn.onclick = () => {
            this.toggleVideoFavorite(video.id);
            const isNowFavorite = userSettings.favoriteVideos?.some(v => v.id === video.id) || false;
            toggleFavoriteBtn.icon = isNowFavorite ? 'favorite--outlined' : 'favorite';
        };

        // 关闭按钮事件
        document.getElementById('closeIframeBtn').onclick = () => {
            this.closeIframePlayer();
        };

        // 添加到最近观看
        this.addToRecentVideos(video);

        // 显示iframe播放器页面并更新URL
        showPage('iframePlayer', false); // 不使用showPage的URL更新

        // 手动更新URL，支持通过URL直接访问和恢复播放
        if (window.location.hash !== `#iframePlayer/${encodeURIComponent(video.id)}`) {
            history.pushState(null, null, `#iframePlayer/${encodeURIComponent(video.id)}`);
        }
    },

    // 关闭iframe播放器
    closeIframePlayer() {
        const iframePlayerFrame = document.getElementById('iframePlayerFrame');
        if (iframePlayerFrame) {
            // 确保清空iframe释放资源
            iframePlayerFrame.src = 'about:blank';
        }

        // 返回视频列表页
        showPage('video');
    },

    // 关闭视频播放器
    closeVideoPlayer() {
        const videoPlayer = document.getElementById('customVideoPlayer');

        // 保存播放进度
        this.saveVideoProgress();

        // 清理播放器
        if (videoPlayer) {
            // 清理缓冲区监听器
            if (typeof videoPlayer._bufferCleanup === 'function') {
                videoPlayer._bufferCleanup();
                videoPlayer._bufferCleanup = null;
            }

            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            const videoSource = videoPlayer.querySelector('source');
            if (videoSource) {
                videoSource.src = '';
            }
            videoPlayer.load();
        }

        // 清理HLS实例
        if (window._hlsPlayer) {
            window._hlsPlayer.destroy();
            window._hlsPlayer = null;
        }

        // 清理临时预览视频元素
        if (window._tempVideoPreview) {
            window._tempVideoPreview.pause();
            window._tempVideoPreview.src = '';
            window._tempVideoPreview.remove();
            window._tempVideoPreview = null;
        }

        // 返回视频列表页
        showPage('video');
    },

    // 播放API视频项目
    async playVideoItem(item, episodeIndex = 0) {
        if (!item || !item.vod_id || !item.sourceUrl) {
            snackbar.error('无效的视频项目');
            return;
        }

        try {
            // 获取视频详情
            const baseUrl = item.sourceUrl.replace(/\/+$/, "");
            const detailUrl = baseUrl + this.apiPaths.detail + item.vod_id;
            const encodedDetailUrl = encodeURIComponent(detailUrl);

            console.log(`Fetching details for: ${item.vod_name}, Detail URL: ${detailUrl}`);

            const videoDataResponse = await ApiService.call(
                `/videoproxy/get?target=${encodedDetailUrl}`, 'GET'
            );

            if (!videoDataResponse || !videoDataResponse.list || videoDataResponse.list.length === 0) {
                console.error('获取视频详情失败:', videoDataResponse);
                snackbar.error('获取视频详情失败，请检查视频源或网络');
                return;
            }

            const videoData = videoDataResponse.list[0];

            if (!videoData.vod_play_url) {
                snackbar.error('未找到播放链接');
                return;
            }

            // 解析播放URL
            const parsedUrls = this.parsePlayUrl(videoData.vod_play_url);
            if (!parsedUrls || parsedUrls.length === 0 || !parsedUrls[0].urls || parsedUrls[0].urls.length === 0) {
                snackbar.error('解析播放链接失败');
                return;
            }

            // 获取所有有效剧集
            let allEpisodes = [];
            let selectedSource = parsedUrls[0];

            // 尝试找到m3u8源
            for (const source of parsedUrls) {
                if (source.sourceName.includes('m3u8')) {
                    selectedSource = source;
                    break;
                }
            }

            // 合并所有线路的剧集（去重）
            for (const source of parsedUrls) {
                if (!source.urls || source.urls.length === 0) continue;

                // 只添加m3u8或mp4链接
                const validEpisodes = source.urls.filter(ep =>
                    ep.url && (ep.url.includes('.m3u8') || ep.url.includes('.mp4'))
                );

                if (validEpisodes.length > 0) {
                    // 去重
                    for (const episode of validEpisodes) {
                        if (!allEpisodes.some(ep => ep.name === episode.name)) {
                            allEpisodes.push(episode);
                        }
                    }
                }
            }

            // 排序剧集
            allEpisodes.sort((a, b) => {
                // 尝试提取数字进行排序
                const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');

                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }

                return a.name.localeCompare(b.name);
            });

            // 确保集数索引有效
            if (episodeIndex >= allEpisodes.length) {
                episodeIndex = 0;
            }

            const selectedEpisode = allEpisodes[episodeIndex];

            if (!selectedEpisode || !selectedEpisode.url) {
                snackbar.error('无法获取视频播放链接');
                hideLoading();
                return;
            }

            const playUrl = selectedEpisode.url;
            console.log(`Playing: ${selectedEpisode.name} - ${playUrl}`);

            // 保存当前视频和集数信息
            this.state.currentVideo = item;
            this.state.currentEpisodeIndex = episodeIndex;

            // 获取DOM元素
            const videoPlayer = document.getElementById('customVideoPlayer');
            const videoSource = videoPlayer.querySelector('source');
            const videoPlayerTitle = document.getElementById('videoPlayerTitle');
            const videoPlayerInfoTitle = document.getElementById('videoPlayerInfoTitle');
            const videoPlayerInfoDetails = document.getElementById('videoPlayerInfoDetails');
            const toggleFavoriteBtn = document.getElementById('toggleVideoFavoriteBtn');
            const episodesDrawer = document.getElementById('episodesDrawer');
            const currentEpisodeTitle = document.getElementById('currentEpisodeTitle');

            // 更新视频信息
            videoPlayerTitle.textContent = videoData.vod_name || '正在播放';
            videoPlayerInfoTitle.textContent = videoData.vod_name || '正在播放';

            const details = [
                videoData.vod_remarks,
                videoData.vod_year,
                videoData.vod_director
              ].filter(Boolean).join(' - ');
              
              videoPlayerInfoDetails.textContent = details;

            // 更新当前集数显示
            if (currentEpisodeTitle) {
                currentEpisodeTitle.textContent = `${selectedEpisode.name} · 共${allEpisodes.length}集`;
            }

            // 设置视频源
            videoSource.src = playUrl;
            videoSource.type = playUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';
            videoPlayer.load();

            // 监听视频加载完成事件，移除changing-episode类
            const handleVideoReady = () => {
                // 移除过渡动画类
                videoPlayer.classList.remove('changing-episode');
            };

            // 添加多个事件监听，确保在视频准备好时移除过渡效果
            videoPlayer.addEventListener('loadeddata', handleVideoReady);
            videoPlayer.addEventListener('canplay', handleVideoReady);

            // 更新收藏按钮状态
            const isFavorite = userSettings.favoriteVideos?.some(v => v.id === item.id) || false;
            toggleFavoriteBtn.icon = isFavorite ? 'favorite--outlined' : 'favorite';
            toggleFavoriteBtn.style.color = isFavorite ? '#ff4081' : 'white';

            // 收藏按钮事件
            toggleFavoriteBtn.onclick = () => {
                this.toggleVideoFavorite(item.id);
                const isNowFavorite = userSettings.favoriteVideos?.some(v => v.id === item.id) || false;
                toggleFavoriteBtn.icon = isNowFavorite ? 'favorite--outlined' : 'favorite';
                toggleFavoriteBtn.style.color = isNowFavorite ? '#ff4081' : 'white';
            };

            // 渲染剧集选择器
            this.renderEpisodes(allEpisodes, episodeIndex, item);

            // 显示剧集抽屉
            if (episodesDrawer && allEpisodes.length > 1) {
                episodesDrawer.style.display = 'flex';
            } else if (episodesDrawer) {
                episodesDrawer.style.display = 'none';
            }

            // 关闭按钮事件
            document.getElementById('closeVideoBtn').onclick = () => {
                this.closeVideoPlayer();
            };

            // m3u8视频使用hls.js播放
            if (playUrl.includes('.m3u8')) {
                this.loadHlsLibraryIfNeeded(() => {
                    this.initHlsPlayer(videoPlayer, playUrl, item.id, episodeIndex);
                });
            } else {
                // 普通mp4视频初始化控件
                this.initVideoPlayerControls(videoPlayer);
            }

            // 显示播放器页面并更新URL
            showPage('videoPlayer', false); // 不使用showPage的URL更新

            // 手动更新URL，支持通过URL直接访问和恢复播放
            const videoId = item.id || item.vod_id;
            if (window.location.hash !== `#videoPlayer/${encodeURIComponent(videoId)}/${episodeIndex}`) {
                history.pushState(null, null, `#videoPlayer/${encodeURIComponent(videoId)}/${episodeIndex}`);
            }

            hideLoading();

            // 恢复播放进度
            this.restoreVideoProgress(item.id, episodeIndex);

        } catch (error) {
            console.error('播放视频时出错:', error);
            snackbar.error('播放视频时出错');
            hideLoading();
        }
    },

    // 解析视频播放URL
    parsePlayUrl(playUrlString) {
        if (!playUrlString || typeof playUrlString !== 'string') return [];

        const sourcesOutput = [];
        const sourceGroups = playUrlString.split('$$$');

        sourceGroups.forEach((group, index) => {
            if (!group.trim()) return;

            const episodes = [];
            // 按 # 或 换行符分割剧集
            const lines = group.split(/[#\n]+/);

            lines.forEach(line => {
                const parts = line.split('$');
                if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
                    episodes.push({ name: parts[0].trim(), url: parts[1].trim() });
                }
            });

            if (episodes.length > 0) {
                // 根据URL类型设置线路名称
                let sourceName = `线路${index + 1}`;

                if (episodes[0].url.includes('.m3u8')) {
                    sourceName = `线路${index + 1} (m3u8)`;
                } else if (episodes[0].url.includes('.mp4')) {
                    sourceName = `线路${index + 1} (mp4)`;
                } else if (episodes[0].url.includes('/share/')) {
                    sourceName = `线路${index + 1} (网页)`;
                }

                sourcesOutput.push({ sourceName, urls: episodes });
            }
        });

        return sourcesOutput;
    },

    // 渲染剧集选择器
    renderEpisodes(episodes, currentIndex, item) {
        const episodesContainer = document.getElementById('episodesListContainer');
        const videoPlayerInfo = document.querySelector('.video-player-info');
        const episodesDrawer = document.getElementById('episodesDrawer');
        if (!episodesContainer) return;

        // 清空容器
        episodesContainer.innerHTML = '';

        // 如果没有剧集，添加默认
        if (!episodes || episodes.length === 0) {
            const defaultBtn = document.createElement('div');
            defaultBtn.className = 'episode-button playing';
            defaultBtn.textContent = '第1集';
            defaultBtn.setAttribute('data-index', 0);
            episodesContainer.appendChild(defaultBtn);

            // 隐藏选集面板并添加类到video-player-info
            if (episodesDrawer) {
                episodesDrawer.style.display = 'none';
            }
            if (videoPlayerInfo) {
                videoPlayerInfo.classList.add('no-episodes');
            }
            return;
        }

        // 只有一集时也隐藏选集面板并添加类
        if (episodes.length === 1) {
            if (episodesDrawer) {
                episodesDrawer.style.display = 'none';
            }
            if (videoPlayerInfo) {
                videoPlayerInfo.classList.add('no-episodes');
            }
        } else {
            // 多集时移除no-episodes类
            if (videoPlayerInfo) {
                videoPlayerInfo.classList.remove('no-episodes');
            }
        }

        // 添加剧集按钮
        episodes.forEach((episode, index) => {
            const btn = document.createElement('div');
            btn.className = 'episode-button';
            btn.textContent = episode.name;
            btn.setAttribute('data-index', index);

            if (index === currentIndex) {
                btn.classList.add('playing');
            }

            // 只有多集时添加点击事件
            if (episodes.length > 1) {
                btn.onclick = () => {
                    if (index === currentIndex) return;

                    // 添加过渡动画
                    const videoPlayer = document.getElementById('customVideoPlayer');
                    if (videoPlayer) {
                        videoPlayer.classList.add('changing-episode');
                        // 不在这里设置定时器移除changing-episode类，而是在新视频加载完成后移除
                    }

                    // 更新URL以支持刷新后恢复播放
                    const videoId = item.id || item.vod_id;
                    if (window.location.hash !== `#videoPlayer/${encodeURIComponent(videoId)}/${index}`) {
                        history.pushState(null, null, `#videoPlayer/${encodeURIComponent(videoId)}/${index}`);
                    }

                    // 延迟播放切换，确保UI更新
                    setTimeout(() => {
                        this.playVideoItem(item, index);

                        // 视频需要完全加载后再显示，在这里不尝试自动播放
                    }, 50);
                };
            } else {
                btn.classList.add('single-episode');
            }

            episodesContainer.appendChild(btn);
        });

        // 确保剧集容器可以正常滚动
        episodesContainer.addEventListener('touchstart', function (e) {
            // 阻止事件冒泡，避免触发视频播放器的触摸控制
            e.stopPropagation();
        }, false);

        episodesContainer.addEventListener('touchmove', function (e) {
            // 阻止事件冒泡，避免触发视频播放器的触摸控制
            e.stopPropagation();
        }, { passive: true });

        episodesContainer.addEventListener('touchend', function (e) {
            // 阻止事件冒泡，避免触发视频播放器的触摸控制
            e.stopPropagation();
        }, false);

        // 滚动到当前播放剧集
        const playingButton = episodesContainer.querySelector('.playing');
        if (playingButton) {
            // 计算滚动位置使当前剧集居中
            setTimeout(() => {
                playingButton.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            }, 100);
        }

        // 处理播放结束自动播放下一集
        const videoPlayer = document.getElementById('customVideoPlayer');
        if (videoPlayer) {
            // 移除之前的事件监听
            if (videoPlayer._autoPlayNextHandler) {
                videoPlayer.removeEventListener('ended', videoPlayer._autoPlayNextHandler);
            }

            // 多集时添加自动播放下一集
            if (episodes.length > 1) {
                const autoPlayNextHandler = () => {
                    const nextIndex = currentIndex + 1;
                    if (nextIndex < episodes.length) {
                        this.showToast('正在播放下一集...');

                        // 添加过渡动画
                        const videoPlayer = document.getElementById('customVideoPlayer');
                        if (videoPlayer) {
                            videoPlayer.classList.add('changing-episode');
                            // 不在这里移除changing-episode类，而是在新视频加载完成后移除
                        }

                        // 更新URL，支持通过URL直接访问和恢复播放
                        const videoId = item.id || item.vod_id;
                        if (window.location.hash !== `#videoPlayer/${encodeURIComponent(videoId)}/${nextIndex}`) {
                            history.pushState(null, null, `#videoPlayer/${encodeURIComponent(videoId)}/${nextIndex}`);
                        }

                        setTimeout(() => {
                            this.playVideoItem(item, nextIndex);
                            // 视频需要完全加载后再显示，在此不进行自动播放
                        }, 50);
                    } else {
                        this.showToast('已播放完最后一集');
                    }
                };

                videoPlayer._autoPlayNextHandler = autoPlayNextHandler;
                videoPlayer.addEventListener('ended', autoPlayNextHandler);
            }
        }
    },

    // 显示通知吐司
    showToast(message) {
        // 移除现有吐司
        const existingToast = document.querySelector('.video-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // 创建新吐司
        const toast = document.createElement('div');
        toast.className = 'video-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 显示动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // 3秒后隐藏
        setTimeout(() => {
            toast.classList.remove('show');

            // 动画结束后移除
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    },

    // 保存视频播放进度
    saveVideoProgress() {
        const videoPlayer = document.getElementById('customVideoPlayer');
        if (!videoPlayer) return;

        const currentVideo = this.state.currentVideo;
        if (!currentVideo) return;

        // 确保进度数据结构存在
        if (!userSettings.videoProgress) {
            userSettings.videoProgress = {};
        }

        // 只有有效播放时间时才保存
        if (videoPlayer.currentTime > 0 && videoPlayer.duration) {
            const videoId = currentVideo.id || currentVideo.vod_id;

            userSettings.videoProgress[videoId] = {
                episodeIndex: this.state.currentEpisodeIndex,
                position: videoPlayer.currentTime,
                duration: videoPlayer.duration,
                lastPlayed: Date.now()
            };

            UserManager.saveSettings().catch(err => {
                console.error('保存视频进度失败', err);
            });
        }
    },

    // 恢复播放进度
    restoreVideoProgress(videoId, episodeIndex) {
        const videoPlayer = document.getElementById('customVideoPlayer');
        if (!videoPlayer) return;

        const restorePosition = () => {
            if (userSettings.videoProgress && userSettings.videoProgress[videoId]) {
                const savedProgress = userSettings.videoProgress[videoId];
                console.log(`视频 ${videoId} 的保存进度:`, savedProgress);
                console.log(`当前正在播放第 ${episodeIndex + 1} 集，保存的是第 ${savedProgress.episodeIndex + 1} 集`);

                // 只恢复同一集的进度
                if (savedProgress.episodeIndex === episodeIndex &&
                    savedProgress.position > 0 && videoPlayer.duration) {

                    // 避免恢复到结尾附近的位置
                    if (savedProgress.position < videoPlayer.duration - 5) {
                        console.log(`恢复到保存的进度: ${savedProgress.position}秒`);
                        videoPlayer.currentTime = savedProgress.position;
                    } else {
                        console.log(`视频进度已接近结束，从头开始播放`);
                        videoPlayer.currentTime = 0;
                    }
                } else {
                    // 不同集数从头开始
                    console.log(`播放不同的集数，从头开始播放`);
                    videoPlayer.currentTime = 0;
                }
            } else {
                console.log(`没有找到视频 ${videoId} 的保存进度`);
            }

            videoPlayer.removeEventListener('loadedmetadata', restorePosition);
        };

        // 等待视频加载元数据后恢复进度
        videoPlayer.addEventListener('loadedmetadata', restorePosition);
    },

    // 加载HLS库
    loadHlsLibraryIfNeeded(callback) {
        if (window.Hls) {
            callback();
            return;
        }
        console.log('HLS库未加载');
    },

    // 初始化HLS播放器
    initHlsPlayer(videoElement, url, videoId, episodeIndex) {
        if (!Hls.isSupported()) {
            snackbar.error('您的浏览器不支持HLS视频播放');
            return;
        }

        // 销毁之前的HLS实例
        if (window._hlsPlayer) {
            window._hlsPlayer.destroy();
        }

        // 创建新的HLS实例
        const hls = new Hls({
            // 最大缓存大小(字节)
            maxBufferSize: 180 * 1000 * 1000
        });

        window._hlsPlayer = hls;

        // 监听错误事件
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log("尝试恢复网络错误...");
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log("尝试恢复媒体错误...");
                        hls.recoverMediaError();
                        break;
                    default:
                        console.error("无法恢复的错误:", data);
                        hls.destroy();
                        snackbar.error('加载视频源失败');
                        break;
                }
            }
        });

        // 隐藏加载指示器
        hls.on(Hls.Events.LEVEL_LOADED, () => {
            const loadingIndicator = document.querySelector('.video-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        });

        // 加载视频源
        hls.loadSource(url);
        hls.attachMedia(videoElement);

        // 监听视频加载完成事件，移除changing-episode类
        const handleVideoReady = () => {
            // 移除过渡动画类
            videoElement.classList.remove('changing-episode');
        };

        // 添加多个事件监听，确保在视频准备好时移除过渡效果
        videoElement.addEventListener('loadeddata', handleVideoReady);
        videoElement.addEventListener('canplay', handleVideoReady);

        // 视频准备就绪后尝试自动播放
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // 尝试自动播放
            videoElement.play().catch(err => {
                // 自动播放失败时，将按钮显示为播放图标
                const playPauseBtn = document.querySelector('.play-pause-btn');
                if (playPauseBtn) playPauseBtn.icon = 'play_arrow';
                console.error('HLS视频自动播放失败:', err);
            });

            // 确保在清单解析完成后也移除过渡效果
            handleVideoReady();
        });

        // 初始化播放器控件
        this.initVideoPlayerControls(videoElement);

        // 设置定时保存进度
        this.setupProgressSaving(videoElement, videoId, episodeIndex);
    },

    // 设置定时保存进度
    setupProgressSaving(videoElement, videoId, episodeIndex) {
        // 清除之前的定时器
        if (this.state.progressSaveTimer) {
            clearInterval(this.state.progressSaveTimer);
        }

        // 设置新的定时器
        this.state.progressSaveTimer = setInterval(() => {
            if (videoElement && videoElement.currentTime > 0 && videoElement.duration) {
                if (!userSettings.videoProgress) {
                    userSettings.videoProgress = {};
                }

                userSettings.videoProgress[videoId] = {
                    episodeIndex: episodeIndex,
                    position: videoElement.currentTime,
                    duration: videoElement.duration,
                    lastPlayed: Date.now()
                };

                UserManager.saveSettings().catch(err => {
                    console.error('保存视频进度失败', err);
                });
            }
        }, this.config.AUTO_SAVE_PROGRESS_INTERVAL);

        // 播放结束时保存
        videoElement.addEventListener('ended', () => {
            if (this.state.progressSaveTimer) {
                clearInterval(this.state.progressSaveTimer);
            }

            // 结束时保存全部进度（这样可以记录已看完）
            if (videoElement.duration) {
                if (!userSettings.videoProgress) {
                    userSettings.videoProgress = {};
                }

                userSettings.videoProgress[videoId] = {
                    episodeIndex: episodeIndex,
                    position: videoElement.duration,
                    duration: videoElement.duration,
                    lastPlayed: Date.now()
                };

                UserManager.saveSettings().catch(err => {
                    console.error('保存视频进度失败', err);
                });
            }
        });
    },

    // 初始化视频播放器控件
    initVideoPlayerControls(videoElement) {
        const videoContainer = videoElement.closest('.video-player-main');
        if (videoContainer) {
            // 初始时设置控件可见
            this.showControls(videoContainer);
        }

        this.setupPlayPauseControls(videoElement);
        this.setupVolumeControls(videoElement);
        this.setupProgressControls(videoElement);
        this.setupFullscreenControls(videoElement);
        this.setupSpeedControls(videoElement);
        this.setupKeyboardControls(videoElement);
        this.setupTouchControls(videoElement);
    },

    // 设置播放/暂停控件
    setupPlayPauseControls(videoElement) {
        const playerContainer = videoElement.closest('.video-player-main');
        let playPauseBtn = document.querySelector('.play-pause-btn');

        // 点击事件
        playPauseBtn.onclick = () => {
            if (videoElement.paused) {
                videoElement.play().catch(err => {
                    console.error('播放失败:', err);
                });
            } else {
                videoElement.pause();
            }
        };

        // 状态变化监听
        videoElement.onplay = () => {
            playPauseBtn.icon = 'pause';
        };

        videoElement.onpause = () => {
            playPauseBtn.icon = 'play_arrow';
        };

        // 视频区域点击切换播放/暂停
        if (!playerContainer._clickHandlerAdded) {
            playerContainer._clickHandlerAdded = true;

            playerContainer.onclick = (e) => {
                // 跳过控制区点击
                if (e.target.closest('.video-player-actions') ||
                    e.target.closest('.video-player-header') ||
                    e.target.closest('.video-player-info') ||
                    e.target.closest('.video-progress-container') ||
                    e.target.closest('.episodes-drawer') ||
                    e.target.closest('mdui-button') ||
                    e.target.closest('mdui-button-icon')) {
                    return;
                }

                // 检查控制器当前是否可见
                const controlsVisible = playerContainer.classList.contains('controls-visible');
                const overlay = playerContainer.querySelector('.video-player-overlay');
                const overlayVisible = overlay && window.getComputedStyle(overlay).opacity > 0.5;

                // 如果控制器可见，点击则切换播放状态
                if (controlsVisible && overlayVisible) {
                    if (videoElement.paused) {
                        videoElement.play().catch(err => {
                            console.error('播放失败:', err);
                        });
                    } else {
                        videoElement.pause();
                    }
                } else {
                    // 如果控制器不可见，点击则显示控制器
                    this.showControls(playerContainer);
                }
            };
        }
    },

    // 设置音量控件
    setupVolumeControls(videoElement) {

        const volumeSlider = document.querySelector('.video-volume-slider');
        const volumeIcon = document.querySelector('.volume-icon');

        volumeSlider.value = videoElement.volume.toString();

        // 音量变化事件
        volumeSlider.oninput = () => {
            const volume = parseFloat(volumeSlider.value);
            videoElement.volume = volume;

            // 根据音量更新图标
            if (volume === 0) {
                volumeIcon.icon = 'volume_off';
            } else if (volume < 0.5) {
                volumeIcon.icon = 'volume_down';
            } else {
                volumeIcon.icon = 'volume_up';
            }
        }

        // 点击图标静音/取消静音
        volumeIcon.onclick = () => {
            if (videoElement.volume > 0) {
                // 记住当前音量并静音
                volumeIcon.dataset.lastVolume = volumeSlider.value;
                volumeSlider.value = '0';
                videoElement.volume = 0;
                volumeIcon.icon = 'volume_off';
            } else {
                // 恢复音量
                const lastVolume = volumeIcon.dataset.lastVolume || '0.5';
                volumeSlider.value = lastVolume;
                videoElement.volume = parseFloat(lastVolume);
                volumeIcon.icon = videoElement.volume < 0.5 ? 'volume_down' : 'volume_up';
            }
        };
    },

    // 设置进度控件
    setupProgressControls(videoElement) {
        const progressContainer = document.querySelector('.video-progress-container');
        const progressSlider = document.querySelector('.video-progress-slider');
        const currentTimeElement = document.getElementById('currentTime');
        const totalTimeElement = document.getElementById('totalTime');

        if (!progressContainer || !progressSlider ||
            !currentTimeElement || !totalTimeElement) {
            return;
        }

        progressSlider.labelFormatter = (value) => {
            const seconds = Math.floor(value / 1000);
            return formatTime(seconds);
        };

        // 格式化时间
        const formatTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            if (hours > 0) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }

            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        // 更新滑块最大值
        const updateSliderMaxValue = () => {
            if (videoElement.duration && isFinite(videoElement.duration)) {
                // 设置滑块最大值为视频总秒数x1000(毫秒)
                const maxValue = Math.floor(videoElement.duration * 1000);
                progressSlider.max = maxValue;
                console.log(`视频时长: ${videoElement.duration}秒, 滑块最大值: ${maxValue}`);
            }
        };

        // 更新时间显示和滑块值
        const updateProgress = () => {
            if (videoElement.duration && isFinite(videoElement.duration)) {
                // 更新滑块值（毫秒）
                const currentValue = Math.floor(videoElement.currentTime * 1000);
                // 只在非拖动状态下更新滑块值
                if (!isDragging && !isTouchDragging) {
                    progressSlider.value = currentValue;
                }

                // 更新时间显示
                currentTimeElement.textContent = formatTime(videoElement.currentTime);
                totalTimeElement.textContent = formatTime(videoElement.duration);
            }
        };

        // 更新加载状态
        const updateLoadingStatus = () => {
            const loadingIndicator = document.querySelector('.video-loading-indicator');
            if (loadingIndicator) {
                if (videoElement.readyState < 3) {
                    loadingIndicator.style.display = 'block';
                } else {
                    loadingIndicator.style.display = 'none';
                }
            }

            // 同时更新缓冲区显示
            this.updateBufferProgress(videoElement);
        };

        // 预览功能已移除

        // 当视频元数据加载后，更新滑块最大值
        videoElement.addEventListener('loadedmetadata', updateSliderMaxValue);
        videoElement.addEventListener('durationchange', updateSliderMaxValue);

        // 移除现有timeupdate监听器
        videoElement.removeEventListener('timeupdate', videoElement._progressUpdateHandler);

        // 添加新监听器
        videoElement._progressUpdateHandler = updateProgress;
        videoElement.addEventListener('timeupdate', updateProgress);

        // 监听加载状态
        videoElement.addEventListener('waiting', updateLoadingStatus);
        videoElement.addEventListener('canplay', updateLoadingStatus);

        // 监听缓冲进度
        videoElement.addEventListener('progress', () => this.updateBufferProgress(videoElement));

        // 监听窗口大小变化，更新缓冲区显示
        const updateBufferOnResize = () => {
            setTimeout(() => this.updateBufferProgress(videoElement), 300);
        };
        window.addEventListener('resize', updateBufferOnResize);

        // 在视频元数据加载时也更新缓冲区
        videoElement.addEventListener('loadedmetadata', updateBufferOnResize);

        // 清除函数，用于视频播放器关闭时调用
        const cleanup = () => {
            window.removeEventListener('resize', updateBufferOnResize);
        };

        // 存储清除函数到videoElement，以便在视频关闭时调用
        videoElement._bufferCleanup = cleanup;

        // 进度条点击和拖动
        let isDragging = false;
        let isTouchDragging = false;
        let lastClientX = 0;

        // 是否为触摸事件触发
        const isTouchEvent = (e) => {
            return e.pointerType === 'touch' || e.type.includes('touch');
        };

        // 处理滑块输入变化
        progressSlider.addEventListener('input', (e) => {
            // 获取滑块当前值（毫秒）
            const sliderValue = Number(progressSlider.value);

            // 计算视频位置（秒）
            const seekTime = sliderValue / 1000;

            // 更新时间显示
            currentTimeElement.textContent = formatTime(seekTime);

            // 标记为正在拖动
            if (!isDragging && !isTouchDragging) {
                if (isTouchEvent(e)) {
                    isTouchDragging = true;
                } else {
                    isDragging = true;
                }
                progressContainer.classList.add('dragging');
            }
        });

        // 鼠标悬停时不再显示预览
        progressContainer.addEventListener('mousemove', (e) => {
            // 预览功能已移除
        });

        // 处理滑块拖动结束
        progressSlider.addEventListener('change', (e) => {
            // 获取滑块当前值（毫秒）
            const sliderValue = Number(progressSlider.value);

            // 设置视频时间（秒）
            videoElement.currentTime = sliderValue / 1000;

            // 重置拖动状态
            isDragging = false;
            isTouchDragging = false;
            progressContainer.classList.remove('dragging');
        });

        // 鼠标离开时不再需要隐藏预览
        progressContainer.addEventListener('mouseleave', (e) => {
            // 预览功能已移除
        });

        // 初始显示
        if (videoElement.duration && isFinite(videoElement.duration)) {
            totalTimeElement.textContent = formatTime(videoElement.duration);
            updateSliderMaxValue();
        }

        currentTimeElement.textContent = formatTime(0);
    },

    // 设置全屏控件
    setupFullscreenControls(videoElement) {
        const fullscreenBtn = document.querySelector('.video-fullscreen-btn');
        const playerContainer = document.querySelector('.video-player-fullscreen');

        // 点击事件
        fullscreenBtn.onclick = () => {
            this.toggleFullscreen(playerContainer, videoElement);
        };

        // 全屏状态变化
        document.addEventListener('fullscreenchange', () => {
            fullscreenBtn.icon = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
            document.querySelector('.video-player-header').className = document.fullscreenElement ? 'video-player-header hidden' : 'video-player-header';
            this.handleFullscreenChange(!!document.fullscreenElement, videoElement);
        });

        // 兼容Webkit前缀的浏览器(Safari, iOS等)
        document.addEventListener('webkitfullscreenchange', () => {
            fullscreenBtn.icon = document.webkitFullscreenElement ? 'fullscreen_exit' : 'fullscreen';
            this.handleFullscreenChange(!!document.webkitFullscreenElement, videoElement);
        });

    },

    // 切换全屏状态
    toggleFullscreen(playerContainer, videoElement) {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            // 进入全屏
            if (playerContainer) {
                // 尝试使用标准全屏API
                if (playerContainer.requestFullscreen) {
                    playerContainer.requestFullscreen().catch(err => {
                        console.warn('标准全屏失败，尝试替代方法:', err);
                        this.tryAlternativeFullscreen(videoElement, playerContainer);
                    });
                }
                // Webkit前缀(Safari, iOS等)
                else if (playerContainer.webkitRequestFullscreen) {
                    playerContainer.webkitRequestFullscreen().catch(err => {
                        console.warn('Webkit全屏失败，尝试替代方法:', err);
                        this.tryAlternativeFullscreen(videoElement, playerContainer);
                    });
                }
                // MS前缀
                else if (playerContainer.msRequestFullscreen) {
                    playerContainer.msRequestFullscreen().catch(err => {
                        console.warn('MS全屏失败，尝试替代方法:', err);
                        this.tryAlternativeFullscreen(videoElement, playerContainer);
                    });
                }
                // 直接尝试替代方法(iOS等平台可能不支持上述方法)
                else {
                    this.tryAlternativeFullscreen(videoElement, playerContainer);
                }
            }
        } else {
            // 退出全屏
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            } else {
                // 如果无法退出标准全屏，尝试恢复元素样式
                this.exitAlternativeFullscreen(videoElement, playerContainer);
            }
        }
    },

    // 处理全屏状态变化
    handleFullscreenChange(isFullscreen, videoElement) {
        // 锁定屏幕方向(仅在支持的移动设备上)
        if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
            if (isFullscreen) {
                // 进入全屏时锁定为横屏
                window.screen.orientation.lock('landscape')
                    .then(() => {
                        console.log('屏幕已锁定为横向模式');
                    })
                    .catch((error) => {
                        console.warn('无法锁定屏幕方向:', error);
                    });
            } else {
                // 退出全屏时解锁屏幕方向
                try {
                    window.screen.orientation.unlock();
                } catch (e) {
                    console.warn('解锁屏幕方向失败:', e);
                }
            }
        }

        // 在iOS上，我们可能需要强制全屏视频元素
        if (isFullscreen && this.isIOS()) {
            videoElement.webkitEnterFullscreen && videoElement.webkitEnterFullscreen();
        }
    },

    // 尝试替代全屏方法(主要用于iOS)
    tryAlternativeFullscreen(videoElement, container) {
        // 检查是否为iOS设备
        if (this.isIOS()) {
            // iOS设备上使用视频元素的webkitEnterFullscreen方法
            if (videoElement.webkitEnterFullscreen) {
                videoElement.webkitEnterFullscreen();
                return;
            }
        }

        // 其他设备上使用CSS全屏模式
        this.applyFullscreenStyles(container);
    },

    // 退出替代全屏模式
    exitAlternativeFullscreen(videoElement, container) {
        this.removeFullscreenStyles(container);
    },

    // 应用全屏CSS样式
    applyFullscreenStyles(element) {
        if (!element) return;

        // 保存原始样式以便恢复
        element._originalStyles = {
            position: element.style.position,
            top: element.style.top,
            left: element.style.left,
            width: element.style.width,
            height: element.style.height,
            zIndex: element.style.zIndex
        };

        // 应用全屏样式
        element.style.position = 'fixed';
        element.style.top = '0';
        element.style.left = '0';
        element.style.width = '100%';
        element.style.height = '100%';
        element.style.zIndex = '99999';

        // 添加全屏标记
        element.setAttribute('data-alternative-fullscreen', 'true');

        // 触发自定义全屏事件以更新UI
        document.dispatchEvent(new Event('fullscreenchange'));
    },

    // 移除全屏CSS样式
    removeFullscreenStyles(element) {
        if (!element || !element._originalStyles) return;

        // 恢复原始样式
        Object.keys(element._originalStyles).forEach(key => {
            element.style[key] = element._originalStyles[key];
        });

        // 移除全屏标记
        element.removeAttribute('data-alternative-fullscreen');

        // 触发自定义全屏事件以更新UI
        document.dispatchEvent(new Event('fullscreenchange'));
    },

    // 检查是否为iOS设备
    isIOS() {
        return [
            'iPad Simulator',
            'iPhone Simulator',
            'iPod Simulator',
            'iPad',
            'iPhone',
            'iPod'
        ].includes(navigator.platform) ||
            // iPad on iOS 13 detection
            (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    },

    // 设置播放速度控件
    setupSpeedControls(videoElement) {
        let speedControl = document.querySelector('.video-speed-control');
        const speedItems = speedControl.querySelectorAll('.video-speed-item');
        const speedCurrent = speedControl.querySelector('.video-speed-current');

        speedItems.forEach(item => {
            item.onclick = () => {
                const speed = parseFloat(item.dataset.speed);
                videoElement.playbackRate = speed;
                speedCurrent.textContent = `${speed}x`;

                // 更新选中状态
                speedItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            };
        });
    },

    // 设置键盘控制
    setupKeyboardControls(videoElement) {

        document.onkeydown = (e) => {

            // 如果播放页面没有打开,则返回
            const videoPlayer = document.querySelector('#videoPlayerPage');
            if (!videoPlayer || videoPlayer.classList.contains('page-hidden')) {
                return;
            }

            // 空格：播放/暂停
            if (e.code === 'Space') {
                e.preventDefault();
                if (videoElement.paused) {
                    videoElement.play().catch(() => { });
                    this.showToast('播放');
                } else {
                    videoElement.pause();
                    this.showToast('暂停');
                }
            }

            // F：全屏
            else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                const playerContainer = document.querySelector('.video-player-fullscreen');
                this.toggleFullscreen(playerContainer, videoElement);
                this.showToast('全屏');
            }

            // 方向键右：快进
            else if (e.key === 'ArrowRight') {
                e.preventDefault();
                videoElement.currentTime += 10;
                this.showToast('快进 10 秒');
            }

            // 方向键左：快退
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                videoElement.currentTime -= 10;
                this.showToast('快退 10 秒');
            }

            // 方向键上：音量+
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                videoElement.volume = Math.min(1, videoElement.volume + 0.1);
                this.updateVolumeUI(videoElement.volume);
                this.showToast('音量 +');
            }

            // 方向键下：音量-
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                videoElement.volume = Math.max(0, videoElement.volume - 0.1);
                this.updateVolumeUI(videoElement.volume);
                this.showToast('音量 -');
            }
        };

    },

    // 更新音量UI
    updateVolumeUI(volume) {
        const volumeIcon = document.querySelector('.volume-icon');
        const volumeSlider = document.querySelector('.video-volume-slider');

        if (volumeIcon && volumeSlider) {
            if (volume === 0) {
                volumeIcon.icon = 'volume_off';
            } else if (volume < 0.5) {
                volumeIcon.icon = 'volume_down';
            } else {
                volumeIcon.icon = 'volume_up';
            }

            volumeSlider.value = volume.toString();
        }
    },

    // 设置触摸控制
    setupTouchControls(videoElement) {
        const videoContainer = videoElement.closest('.video-player-main');
        if (!videoContainer || videoContainer._touchHandlersAdded) {
            return;
        }

        videoContainer._touchHandlersAdded = true;

        // 添加控件自动隐藏功能
        this.setupAutoHideControls(videoElement, videoContainer);

        // 触摸相关变量
        let touchStartY = 0;
        let touchStartX = 0;
        let touchStartTime = 0;
        let isVerticalSwiping = false;
        let isHorizontalSwiping = false;

        // 检查触摸点是否在进度条附近
        const isTouchNearProgressBar = (clientY) => {
            const progressBar = document.querySelector('.video-progress-container');
            if (!progressBar) return false;

            const rect = progressBar.getBoundingClientRect();
            // 检查是否在进度条上方10px内
            return clientY >= rect.top - 10 && clientY <= rect.bottom + 10;
        };

        // 添加触摸事件
        videoContainer.addEventListener('touchstart', (e) => {
            // 如果触摸事件发生在集数列表容器内，或按钮控制容器内，不处理触摸事件
            if (e.target.closest('#episodesListContainer') || e.target.closest('.episodes-drawer-content') || e.target.closest('.video-control-container') || e.target.closest('.video-player-actions') || e.target.closest('.volume-control')) {
                return;
            }

            // 显示控件
            this.showControls(videoContainer);

            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            touchStartTime = Date.now();
            isVerticalSwiping = false;
            isHorizontalSwiping = false;
        }, { passive: true });

        videoContainer.addEventListener('touchmove', (e) => {
            // 如果触摸事件发生在集数列表容器内，或按钮控制容器内，不处理触摸事件
            if (e.target.closest('#episodesListContainer') || e.target.closest('.episodes-drawer-content') || e.target.closest('.video-control-container') || e.target.closest('.video-player-actions') || e.target.closest('.volume-control')) {
                return;
            }

            if (isVerticalSwiping || isHorizontalSwiping) return;

            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;
            const deltaY = touchY - touchStartY;
            const deltaX = touchX - touchStartX;
            const timeDiff = Date.now() - touchStartTime;

            // 检查是否在进度条区域
            const touchingProgressBar = isTouchNearProgressBar(touchY) || isTouchNearProgressBar(touchStartY);

            // 判断滑动方向
            if (timeDiff < 300) {
                // 垂直滑动 - 切换剧集
                if (Math.abs(deltaY) > 50 && Math.abs(deltaY) > Math.abs(deltaX)) {
                    isVerticalSwiping = true;

                    // 获取当前播放状态
                    const currentVideo = this.state.currentVideo;
                    const currentEpisodeIndex = this.state.currentEpisodeIndex;

                    if (currentVideo && typeof currentEpisodeIndex === 'number') {
                        const episodesContainer = document.getElementById('episodesListContainer');
                        if (episodesContainer) {
                            const episodes = episodesContainer.querySelectorAll('.episode-button');

                            if (episodes.length > 1) {
                                if (deltaY < 0) {
                                    // 上滑 - 下一集
                                    const nextIndex = currentEpisodeIndex + 1;
                                    if (nextIndex < episodes.length) {
                                        this.showToast('切换到下一集');

                                        // 添加过渡动画
                                        const videoPlayer = document.getElementById('customVideoPlayer');
                                        if (videoPlayer) {
                                            videoPlayer.classList.add('changing-episode');
                                            // 不在这里移除changing-episode类，而是在新视频加载完成后移除
                                        }

                                        setTimeout(() => {
                                            this.playVideoItem(currentVideo, nextIndex);
                                        }, 50);
                                    }
                                } else {
                                    // 下滑 - 上一集
                                    const prevIndex = currentEpisodeIndex - 1;
                                    if (prevIndex >= 0) {
                                        this.showToast('切换到上一集');

                                        // 添加过渡动画
                                        const videoPlayer = document.getElementById('customVideoPlayer');
                                        if (videoPlayer) {
                                            videoPlayer.classList.add('changing-episode');
                                            // 不在这里移除changing-episode类，而是在新视频加载完成后移除
                                        }

                                        setTimeout(() => {
                                            this.playVideoItem(currentVideo, prevIndex);
                                        }, 50);
                                    }
                                }
                            }
                        }
                    }
                }
                // 水平滑动 - 快进/快退，但在进度条附近不触发
                else if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && !touchingProgressBar) {
                    isHorizontalSwiping = true;

                    if (deltaX > 0) {
                        // 右滑 - 快进
                        videoElement.currentTime += 10;
                        this.showToast('快进 10 秒');
                    } else {
                        // 左滑 - 快退
                        videoElement.currentTime -= 10;
                        this.showToast('快退 10 秒');
                    }
                }
            }
        }, { passive: true });

        videoContainer.addEventListener('touchend', (e) => {
            // 如果触摸事件发生在集数列表容器内，不处理触摸事件
            if (e.target.closest('#episodesListContainer') || e.target.closest('.episodes-drawer-content')) {
                return;
            }

            isVerticalSwiping = false;
            isHorizontalSwiping = false;
        }, { passive: true });
    },

    // 设置自动隐藏控件
    setupAutoHideControls(videoElement, videoContainer) {
        // 移除之前可能存在的控件隐藏定时器
        if (videoContainer._hideControlsTimer) {
            clearTimeout(videoContainer._hideControlsTimer);
            videoContainer._hideControlsTimer = null;
        }

        // 初始显示控件
        this.showControls(videoContainer);

        // 添加视频容器的事件监听器
        videoContainer.addEventListener('mousemove', () => {
            this.showControls(videoContainer);
        });

        videoContainer.addEventListener('touchstart', () => {
            this.showControls(videoContainer);
        });

        // 监听视频播放状态变化
        videoElement.addEventListener('play', () => {
            // 视频开始播放时，启动自动隐藏计时器
            this.startHideControlsTimer(videoContainer);
        });

        videoElement.addEventListener('pause', () => {
            // 视频暂停时，清除自动隐藏计时器，保持控件显示
            this.clearHideControlsTimer(videoContainer);
            this.showControls(videoContainer);
        });

        // 用户交互控件时，重置自动隐藏计时器
        const controlElements = videoContainer.querySelectorAll('.video-player-actions, .video-progress-container, .video-player-header, .episodes-drawer');
        controlElements.forEach(element => {
            element.addEventListener('touchstart', (e) => {
                // 阻止事件冒泡，避免触发videoContainer的touchstart
                e.stopPropagation();
                // 显示控件并重置计时器
                this.showControls(videoContainer);
            });

            element.addEventListener('mousemove', (e) => {
                // 阻止事件冒泡，避免触发videoContainer的mousemove
                e.stopPropagation();
                // 显示控件并重置计时器
                this.showControls(videoContainer);
            });
        });

        // 如果视频自动播放，启动自动隐藏计时器
        if (videoElement.autoplay || !videoElement.paused) {
            this.startHideControlsTimer(videoContainer);
        }
    },

    // 显示控件
    showControls(videoContainer) {
        const overlay = videoContainer.querySelector('.video-player-overlay');
        if (overlay) {
            videoContainer.classList.add('controls-visible');
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'auto';

            // 重置自动隐藏计时器
            this.clearHideControlsTimer(videoContainer);

            // 如果视频正在播放，启动新的自动隐藏计时器
            const videoElement = videoContainer.querySelector('video');
            if (videoElement && !videoElement.paused) {
                this.startHideControlsTimer(videoContainer);
            }
        }
    },

    // 隐藏控件
    hideControls(videoContainer) {
        const overlay = videoContainer.querySelector('.video-player-overlay');
        if (overlay) {
            videoContainer.classList.remove('controls-visible');
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
        }
    },

    // 启动自动隐藏计时器
    startHideControlsTimer(videoContainer) {
        this.clearHideControlsTimer(videoContainer);
        videoContainer._hideControlsTimer = setTimeout(() => {
            this.hideControls(videoContainer);
        }, 3000); // 3秒后自动隐藏
    },

    // 清除自动隐藏计时器
    clearHideControlsTimer(videoContainer) {
        if (videoContainer._hideControlsTimer) {
            clearTimeout(videoContainer._hideControlsTimer);
            videoContainer._hideControlsTimer = null;
        }
    },

    // 切换剧集面板
    toggleEpisodePanel() {
        const drawer = document.getElementById('episodesDrawer');
        if (drawer) {
            drawer.classList.toggle('expanded');

            // drawer 滚动到有 .playing 的元素
            const playingButton = drawer.querySelector('.playing');
            if (playingButton) {
                document.querySelector('#episodesListContainer').scrollTop = playingButton.offsetTop - document.querySelector('.episodes-drawer-header').offsetHeight;
            }

            // 如果是展开状态，添加点击外部关闭功能
            if (drawer.classList.contains('expanded')) {
                // 添加延时，避免立即触发点击事件
                setTimeout(() => {
                    const closePanel = (e) => {
                        // 如果点击的不是抽屉或抽屉内的元素，则关闭抽屉
                        if (!e.target.closest('#episodesDrawer') && drawer.classList.contains('expanded')) {
                            drawer.classList.remove('expanded');
                            document.removeEventListener('click', closePanel);
                        }
                    };

                    document.addEventListener('click', closePanel);
                }, 100);
            }
        }
    },

    // 更新缓冲区显示
    updateBufferProgress(videoElement) {
        // 获取进度条滑块元素
        const progressSlider = document.querySelector('.video-progress-slider');
        if (!progressSlider || !videoElement || !videoElement.buffered || videoElement.buffered.length === 0) return;

        try {
            // 获取当前播放时间点之前的最大缓冲时间
            let maxBufferEnd = 0;
            const currentTime = videoElement.currentTime;

            for (let i = 0; i < videoElement.buffered.length; i++) {
                const start = videoElement.buffered.start(i);
                const end = videoElement.buffered.end(i);

                // 如果当前时间在此缓冲范围内，更新最大缓冲结束时间
                if (currentTime >= start && currentTime <= end && end > maxBufferEnd) {
                    maxBufferEnd = end;
                }
            }

            // 计算缓冲百分比
            let bufferPercent = 0;
            if (videoElement.duration && isFinite(videoElement.duration)) {
                bufferPercent = (maxBufferEnd / videoElement.duration) * 100;
                bufferPercent = Math.min(100, Math.max(0, bufferPercent)); // 限制在0-100范围内

                // 计算可用宽度（考虑padding）
                const sliderWidth = progressSlider.offsetWidth - 32; // 减去左右两侧padding (16px * 2)

                // 计算缓冲条宽度（像素）
                const bufferWidth = (sliderWidth * bufferPercent) / 100;

                // 设置CSS变量
                progressSlider.style.setProperty('--buffer-progress', `${bufferPercent}%`);

            }
        } catch (e) {
            console.error('更新缓冲区显示失败:', e);
        }
    }
};

// 初始化视频管理器
function loadVideoPageData() {
    VideoManager.init();
}

// 获取滑块thumb位置的辅助函数
const getSliderThumbPosition = (slider) => {
    try {
        // 尝试通过shadowDOM访问
        const thumb = slider.shadowRoot?.querySelector('.mdui-slider-thumb');
        if (thumb) {
            const rect = thumb.getBoundingClientRect();
            return rect.left + (rect.width / 2);
        }

        // 如果无法访问shadowDOM，使用计算方法
        const sliderRect = slider.getBoundingClientRect();
        const padding = 20; // 1.25rem约等于20px
        const effectiveWidth = sliderRect.width - (padding * 2);
        const effectiveLeft = sliderRect.left + padding;

        // 计算thumb位置
        const percent = Number(slider.value) / Number(slider.max);
        return effectiveLeft + (percent * effectiveWidth);
    } catch (e) {
        console.error('获取滑块位置失败:', e);
        return slider.getBoundingClientRect().left + (slider.getBoundingClientRect().width / 2);
    }
};