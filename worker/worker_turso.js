import { createClient } from "@libsql/client/web";

// 数据库版本配置
const DB_VERSION = 2;

async function initializeDatabase(env) {
  try {
    const db = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });

    await db.execute("SELECT 1");

    // 检查系统设置表是否存在
    const checkSystemSettings = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'"
    );
    
    // 如果系统设置表不存在，说明是全新数据库
    if (checkSystemSettings.rows.length === 0) {
      await initializeNewDatabase(db);
      return true;
    }

    // 检查当前数据库版本
    const versionResult = await db.execute(
      "SELECT value FROM system_settings WHERE key = 'db_version'"
    );
    
    const currentVersion = versionResult.rows.length > 0 ? 
      parseInt(versionResult.rows[0].value) : 1;

    if (currentVersion < DB_VERSION) {
      console.log(`数据库需要从版本 ${currentVersion} 升级到版本 ${DB_VERSION}`);
    }

    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return { error: error.message };
  }
}

async function initializeNewDatabase(db) {
  const createTablesSQL = `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT,
      is_admin BOOLEAN DEFAULT 0,
      account_status TEXT DEFAULT 'active'
    );
    
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY,
      settings_data TEXT,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE user_chapter_rules (
      user_id TEXT PRIMARY KEY,
      data TEXT,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      author TEXT,
      chapter_count INTEGER DEFAULT 0,
      last_read_chapter INTEGER DEFAULT 0,
      last_read_position INTEGER DEFAULT 0,
      created_at TEXT,
      last_read_time TEXT,
      folder_path TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      is_encrypted BOOLEAN DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      chapter_index INTEGER,
      title TEXT,
      content TEXT,
      created_at TEXT,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, chapter_index)
    );
    
    CREATE TABLE tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      expiration INTEGER,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE folders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      path TEXT,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      UNIQUE(user_id, path)
    );
    
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    
    -- 优化索引
    CREATE INDEX idx_books_user_id ON books(user_id);
    CREATE INDEX idx_books_folder ON books(user_id, folder_path);
    CREATE INDEX idx_books_last_read ON books(user_id, last_read_time DESC);
    CREATE INDEX idx_chapters_book_id ON chapters(book_id);
    CREATE INDEX idx_chapters_book_chapter ON chapters(book_id, chapter_index);
    CREATE INDEX idx_tokens_expiration ON tokens(expiration);
    CREATE INDEX idx_tokens_user_id ON tokens(user_id);
    
    INSERT INTO system_settings(key, value, updated_at) VALUES
    ('allow_registration', 'true', datetime('now')),
    ('demo_mode', 'false', datetime('now')),
    ('db_version', '${DB_VERSION}', datetime('now'));
  `;

  await db.executeMultiple(createTablesSQL);
  console.log('新数据库初始化完成');
}

const utils = {
  generateToken() {
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    return Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  parseAuthHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
  },

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  },

  error(message, status = 400) {
    return utils.json({ error: true, message }, status);
  },

  now() {
    return new Date().toISOString();
  },

  parseRoute(path) {
    if (!path || path === '/') return { type: 'root' };
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'videoproxy') {
      return { type: 'videoproxy', action: parts[1] || 'fetch' };
    }

    if (parts[0] === 'auth') {
      return { type: 'auth', action: parts[1] || 'status' };
    }
    if (parts[0] === 'admin') {
      if (parts[1] === 'users') {
        return { type: 'admin', action: 'users', userId: parts[2] || null };
      }
      if (parts[1] === 'settings') {
        return { type: 'admin', action: 'settings' };
      }
    }
    if (parts[0] === 'user') {
      return { type: 'user', action: parts[1] || 'default' };
    }
    if (parts[0] === 'system') {
      return { type: 'system', action: parts[1] || 'settings' };
    }
    if (parts[0] === 'folders') {
      return { type: 'folders', action: parts[1] || 'list' };
    }
    if (parts[0] === 'books') {
      if (parts.length === 1) return { type: 'books', action: 'list' };
      if (parts[1] === 'create') return { type: 'books', action: 'create' };
      if (parts[1] === 'folders') return { type: 'books', action: 'folders' };
      if (parts[1] === 'batch') return { type: 'books', action: 'batch' };

      const bookId = parts[1];
      if (parts.length === 2) return { type: 'books', action: 'get', bookId };
      if (parts[2] === 'info') return { type: 'books', action: 'info', bookId };
      if (parts[2] === 'update') return { type: 'books', action: 'update', bookId };
      if (parts[2] === 'progress') return { type: 'books', action: 'progress', bookId };
      if (parts[2] === 'chapters') {
        return { type: 'books', action: 'chapter', bookId, chapterIndex: parts[3] };
      }
    }
    return { type: 'unknown', path };
  },

  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/'/g, "''").trim();
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  async getSystemSetting(db, key) {
    try {
      const result = await db.execute('SELECT value FROM system_settings WHERE key = ?', [key]);
      return result.rows.length > 0 ? result.rows[0].value : null;
    } catch (error) {
      console.error(`获取系统设置 ${key} 失败:`, error);
      return null;
    }
  },

  async isDemoMode(db) {
    const demoMode = await utils.getSystemSetting(db, 'demo_mode');
    return demoMode === 'true';
  },

  async cleanupDemoAccounts(db) {
    try {
      const isDemoMode = await utils.isDemoMode(db);
      if (!isDemoMode) return false;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString();

      const expiredUsers = await db.execute(
        'SELECT id FROM users WHERE is_admin = 0 AND created_at < ?',
        [yesterdayStr]
      );

      if (expiredUsers.rows.length === 0) return false;

      // 由于外键级联删除，只需要删除用户即可
      const userIds = expiredUsers.rows.map(user => user.id);
      const placeholders = userIds.map(() => '?').join(',');
      
      await db.execute(
        `DELETE FROM users WHERE id IN (${placeholders})`,
        userIds
      );

      console.log(`清理了 ${expiredUsers.rows.length} 个过期演示账户`);
      return true;
    } catch (error) {
      console.error('清理演示账户失败:', error);
      return false;
    }
  }
};

const handlers = {
  async register(request, env) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const data = await request.json();

      if (!data.username || !data.password_hash) {
        return utils.error('用户名和密码不能为空');
      }
      if (data.username.length < 2 || data.username.length > 20) {
        return utils.error('用户名长度应在2-20个字符之间');
      }

      const [settingResult, existingUser, countResult] = await Promise.all([
        db.execute('SELECT value FROM system_settings WHERE key = ?', ['allow_registration']),
        db.execute('SELECT id FROM users WHERE username = ?', [data.username]),
        db.execute('SELECT COUNT(*) as count FROM users')
      ]);

      if (settingResult.rows[0]?.value === 'false') {
        return utils.error('管理员已关闭注册功能', 403);
      }
      if (existingUser.rows.length > 0) {
        return utils.error('用户名已存在');
      }

      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const isFirstUser = countResult.rows[0].count === 0;
      const token = utils.generateToken();
      const tokenExpiration = Date.now() + (30 * 24 * 60 * 60 * 1000);
      const now = utils.now();

      await db.batch([
        {
          sql: 'INSERT INTO users(id, username, password_hash, created_at, is_admin) VALUES(?, ?, ?, ?, ?)',
          args: [userId, data.username, data.password_hash, now, isFirstUser ? 1 : 0]
        },
        {
          sql: 'INSERT INTO user_settings(user_id, settings_data, updated_at) VALUES(?, ?, ?)',
          args: [userId, JSON.stringify({
            fontSize: 18, lineSpacing: 1.6, fontFamily: "'Noto Serif SC', serif",
            firstLineIndent: 2, letterSpacing: 0, paragraphSpacing: 1,
            colorTheme: "default", darkMode: false, favorites: [], recentBooks: [],
            primaryColor: '#5D5CDE'
          }), now]
        },
        {
          sql: 'INSERT INTO tokens(token, user_id, expiration, created_at) VALUES(?, ?, ?, ?)',
          args: [token, userId, tokenExpiration, now]
        }
      ]);

      return utils.json({
        success: true, message: '注册成功', id: userId,
        username: data.username, isAdmin: isFirstUser, token
      });
    } catch (error) {
      console.error('注册失败:', error);
      return utils.error('注册失败：' + error.message);
    }
  },

  async login(request, env) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { username, password_hash } = await request.json();

      if (!username || !password_hash) {
        return utils.error('用户名和密码不能为空');
      }

      const userResult = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
      if (userResult.rows.length === 0) {
        return utils.error('用户不存在', 404);
      }

      const user = userResult.rows[0];
      if (user.account_status !== 'active') {
        return utils.error('账号已被禁用', 403);
      }
      if (user.password_hash !== password_hash) {
        return utils.error('密码错误', 401);
      }

      const token = utils.generateToken();
      const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

      await db.execute(
        'INSERT INTO tokens(token, user_id, expiration, created_at) VALUES(?, ?, ?, ?)',
        [token, user.id, expiration, utils.now()]
      );

      return utils.json({
        success: true, token, user_id: user.id, username: user.username,
        created_at: user.created_at, is_admin: user.is_admin === 1
      });
    } catch (error) {
      console.error('登录失败:', error);
      return utils.error('登录失败: ' + error.message, 500);
    }
  },

  async logout(request, env, userId, params, token) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      await db.execute('DELETE FROM tokens WHERE token = ?', [token]);
      return utils.json({ success: true, message: '登出成功' });
    } catch (error) {
      return utils.error('登出失败: ' + error.message, 500);
    }
  },

  async getVideoProxy(request, env) {
    const url = new URL(request.url);
    const targetUrlParam = url.searchParams.get('target');
    if (!targetUrlParam) {
      return new Response('缺少target参数', { status: 400 });
    }

    try {
      const decodedTargetUrl = decodeURIComponent(targetUrlParam);
      const response = await fetch(decodedTargetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': new URL(decodedTargetUrl).origin,
          'Origin': new URL(decodedTargetUrl).origin
        }
      });

      const newHeaders = new Headers();
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', '*');
      newHeaders.set('Access-Control-Expose-Headers', '*');

      const importantHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      importantHeaders.forEach(header => {
        if (response.headers.has(header)) {
          newHeaders.set(header, response.headers.get(header));
        }
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (error) {
      console.error('视频代理请求失败:', error);
      return new Response('代理请求失败: ' + error.message, { status: 500 });
    }
  },

  async deleteAccount(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { password_hash } = await request.json();

      const userResult = await db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (userResult.rows.length === 0) {
        return utils.error('用户不存在', 404);
      }
      if (userResult.rows[0].password_hash !== password_hash) {
        return utils.error('密码错误', 401);
      }

      // 由于外键级联删除，只需要删除用户即可
      await db.execute('DELETE FROM users WHERE id = ?', [userId]);

      return utils.json({ message: '用户已删除' });
    } catch (error) {
      return utils.error('删除账号失败: ' + error.message, 500);
    }
  },

  async getUserSettings(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const settingsResult = await db.execute('SELECT settings_data FROM user_settings WHERE user_id = ?', [userId]);
      return utils.json({
        settings_data: settingsResult.rows.length > 0 ? settingsResult.rows[0].settings_data : null
      });
    } catch (error) {
      return utils.error('获取用户设置失败: ' + error.message, 500);
    }
  },

  async saveUserSettings(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { settings_data } = await request.json();

      await db.execute(
        'INSERT OR REPLACE INTO user_settings(user_id, settings_data, updated_at) VALUES(?, ?, ?)',
        [userId, settings_data, utils.now()]
      );

      return utils.json({ success: true, message: '设置已保存' });
    } catch (error) {
      return utils.error('保存设置失败: ' + error.message, 500);
    }
  },

  async saveChapterRules(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      const data = await request.json();
      if (!data || !data.data) {
        return utils.error('无效的章节规则数据');
      }

      await db.execute(
        'INSERT OR REPLACE INTO user_chapter_rules(user_id, data, updated_at) VALUES(?, ?, ?)',
        [userId, data.data, utils.now()]
      );

      return utils.json({
        success: true,
        message: '章节规则已保存'
      });
    } catch (error) {
      console.error('保存章节规则失败:', error);
      return utils.error('保存章节规则失败: ' + error.message);
    }
  },

  async getChapterRules(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      const userRules = await db.execute(
        'SELECT data FROM user_chapter_rules WHERE user_id = ?',
        [userId]
      );

      return utils.json({
        success: true,
        data: userRules.rows.length > 0 ? userRules.rows[0].data : null
      });
    } catch (error) {
      console.error('获取章节规则失败:', error);
      return utils.error('获取章节规则失败: ' + error.message);
    }
  },

  async getBooks(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const url = new URL(request.url);
      const folderPath = url.searchParams.get('folder') || '';

      // 优化查询：不查询大字段，使用索引
      let query = `
        SELECT id, title, author, last_read_chapter, last_read_position, 
               last_read_time, created_at, chapter_count, folder_path, 
               file_size, is_encrypted 
        FROM books 
        WHERE user_id = ?
      `;
      const params = [userId];

      if (folderPath === 'uncategorized') {
        query += ' AND (folder_path = \'\' OR folder_path IS NULL)';
      } else if (folderPath) {
        query += ' AND folder_path = ?';
        params.push(folderPath);
      }
      query += ' ORDER BY last_read_time DESC';

      const books = await db.execute(query, params);

      const booksWithFormatting = books.rows.map(book => ({
        ...book,
        formatted_size: utils.formatFileSize(book.file_size || 0),
        is_encrypted: book.is_encrypted === 1
      }));

      return utils.json({ books: booksWithFormatting });
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      return utils.error('获取书籍列表失败: ' + error.message, 500);
    }
  },

  async getBookInfo(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const bookId = params.bookId;

      // 优化：先获取书籍基本信息
      const bookResult = await db.execute(
        'SELECT id, title, author, last_read_chapter, last_read_position, last_read_time, created_at, chapter_count, folder_path, file_size, is_encrypted FROM books WHERE id = ? AND user_id = ?', 
        [bookId, userId]
      );

      if (bookResult.rows.length === 0) {
        return utils.error('未找到书籍', 404);
      }

      const book = bookResult.rows[0];

      // 优化：分页获取章节列表，只获取标题和索引
      const chaptersResult = await db.execute(
        'SELECT chapter_index, title FROM chapters WHERE book_id = ? ORDER BY chapter_index LIMIT 1000',
        [bookId]
      );

      const chapters = chaptersResult.rows.map(chapter => ({
        id: `chapter_${chapter.chapter_index}`,
        title: chapter.title,
        chapter_index: chapter.chapter_index
      }));

      return utils.json({
        book: {
          ...book,
          formatted_size: utils.formatFileSize(book.file_size || 0),
          chapters,
          isEncrypted: book.is_encrypted === 1
        }
      });
    } catch (error) {
      console.error('获取书籍信息失败:', error);
      return utils.error('获取书籍信息失败: ' + error.message, 500);
    }
  },

  async getChapter(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { bookId, chapterIndex } = params;

      // 优化：先验证用户权限
      const bookResult = await db.execute(
        'SELECT id FROM books WHERE id = ? AND user_id = ?', 
        [bookId, userId]
      );

      if (bookResult.rows.length === 0) {
        return utils.error('书籍不存在或无权访问', 404);
      }

      // 优化：直接查询指定章节
      const chapterResult = await db.execute(
        'SELECT chapter_index, title, content FROM chapters WHERE book_id = ? AND chapter_index = ?',
        [bookId, parseInt(chapterIndex)]
      );

      if (chapterResult.rows.length === 0) {
        return utils.error('章节不存在', 404);
      }

      const chapter = chapterResult.rows[0];
      return utils.json({
        chapter: {
          id: `chapter_${chapter.chapter_index}`,
          title: chapter.title,
          content: chapter.content,
          chapter_index: chapter.chapter_index
        }
      });
    } catch (error) {
      console.error('获取章节内容失败:', error);
      return utils.error('获取章节内容失败: ' + error.message, 500);
    }
  },

  async createBook(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { title, author, chapters, folder_path, file_size } = await request.json();

      if (!title) return utils.error('书籍标题不能为空', 400);
      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return utils.error('章节数据无效', 400);
      }

      const bookId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = utils.now();
      const sanitizedFolder = folder_path ? utils.sanitizeInput(folder_path) : '';
      
      // 检测是否加密
      const isEncrypted = chapters.length > 0 &&
        (chapters[0].title?.startsWith("U2FsdGVk") || chapters[0].title?.length > 100);

      const operations = [
        {
          sql: 'INSERT INTO books(id, user_id, title, author, chapter_count, last_read_chapter, last_read_position, created_at, last_read_time, folder_path, file_size, is_encrypted) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [bookId, userId, title, author || '', chapters.length, 0, 0, now, now, sanitizedFolder, file_size || 0, isEncrypted ? 1 : 0]
        }
      ];

      // 批量插入章节数据
      chapters.forEach((chapter, index) => {
        const chapterId = `chapter_${bookId}_${index}`;
        operations.push({
          sql: 'INSERT INTO chapters(id, book_id, chapter_index, title, content, created_at) VALUES(?, ?, ?, ?, ?, ?)',
          args: [chapterId, bookId, index, chapter.title || '', chapter.content || '', now]
        });
      });

      // 如果文件夹不存在则创建
      if (sanitizedFolder) {
        const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        operations.push({
          sql: 'INSERT OR IGNORE INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)',
          args: [folderId, userId, sanitizedFolder, now]
        });
      }

      // 批量执行，提高性能
      await db.batch(operations);

      console.log(`书籍 ${bookId} 创建成功，章节数: ${chapters.length}`);

      return utils.json({
        success: true,
        message: '书籍创建成功',
        book_id: bookId,
        chapter_count: chapters.length
      });
    } catch (error) {
      console.error('创建书籍失败:', error);
      return utils.error('创建书籍失败: ' + error.message, 500);
    }
  },

  async updateBookInfo(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { title, author, folder_path } = await request.json();

      if (!title) return utils.error('书籍标题不能为空', 400);

      const operations = [{
        sql: 'UPDATE books SET title = ?, author = ?, folder_path = ? WHERE id = ? AND user_id = ?',
        args: [title, author || '', folder_path || '', params.bookId, userId]
      }];

      if (folder_path) {
        const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        operations.push({
          sql: 'INSERT OR IGNORE INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)',
          args: [folderId, userId, folder_path, utils.now()]
        });
      }

      await db.batch(operations);
      return utils.json({ success: true, message: '书籍信息已更新' });
    } catch (error) {
      return utils.error('更新书籍信息失败: ' + error.message, 500);
    }
  },

  async updateBookProgress(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { chapter_index, position } = await request.json();

      await db.execute(
        'UPDATE books SET last_read_chapter = ?, last_read_position = ?, last_read_time = ? WHERE id = ? AND user_id = ?',
        [chapter_index, position || 0, utils.now(), params.bookId, userId]
      );

      return utils.json({ success: true, message: '阅读进度已更新' });
    } catch (error) {
      return utils.error('更新阅读进度失败: ' + error.message, 500);
    }
  },

  async deleteBook(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      // 先验证书籍是否存在且属于该用户
      const bookResult = await db.execute(
        'SELECT id FROM books WHERE id = ? AND user_id = ?',
        [params.bookId, userId]
      );

      if (bookResult.rows.length === 0) {
        return utils.error('书籍不存在或无权删除', 404);
      }

      // 由于设置了外键级联删除，只需要删除books表，chapters会自动删除
      const result = await db.execute(
        'DELETE FROM books WHERE id = ? AND user_id = ?',
        [params.bookId, userId]
      );

      if (result.rowsAffected === 0) {
        return utils.error('删除失败，书籍可能已被删除', 404);
      }

      console.log(`书籍 ${params.bookId} 删除成功`);
      return utils.json({ success: true, message: '书籍已删除' });
    } catch (error) {
      console.error('删除书籍失败:', error);
      return utils.error('删除书籍失败: ' + error.message, 500);
    }
  },

  async batchProcessBooks(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { action, bookIds, folder_path } = await request.json();

      if (!action || !bookIds?.length) {
        return utils.error('请求参数不完整', 400);
      }

      if (!Array.isArray(bookIds)) {
        return utils.error('书籍ID列表格式错误', 400);
      }

      // 验证所有书籍都属于该用户
      const placeholders = bookIds.map(() => '?').join(',');
      const bookResult = await db.execute(
        `SELECT id FROM books WHERE id IN (${placeholders}) AND user_id = ?`,
        [...bookIds, userId]
      );

      if (bookResult.rows.length !== bookIds.length) {
        return utils.error('部分书籍不存在或无权操作', 403);
      }

      if (action === 'delete') {
        // 由于外键级联删除，直接删除书籍即可，章节会自动删除
        await db.execute(
          `DELETE FROM books WHERE id IN (${placeholders}) AND user_id = ?`,
          [...bookIds, userId]
        );
      } else if (action === 'move') {
        const sanitizedFolder = utils.sanitizeInput(folder_path || '');
        const operations = [];
        
        bookIds.forEach(bookId => {
          operations.push({
            sql: 'UPDATE books SET folder_path = ? WHERE id = ? AND user_id = ?',
            args: [sanitizedFolder, bookId, userId]
          });
        });

        if (sanitizedFolder) {
          const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          operations.push({
            sql: 'INSERT OR IGNORE INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)',
            args: [folderId, userId, sanitizedFolder, utils.now()]
          });
        }

        await db.batch(operations);
      } else {
        return utils.error('不支持的操作类型', 400);
      }

      console.log(`批量${action === 'delete' ? '删除' : '移动'}了 ${bookIds.length} 本书籍`);

      return utils.json({
        success: true,
        message: action === 'delete'
          ? `已成功删除${bookIds.length}本书籍`
          : `已成功移动${bookIds.length}本书籍`
      });
    } catch (error) {
      console.error('批量处理书籍失败:', error);
      return utils.error('批量处理书籍失败: ' + error.message, 500);
    }
  },

  async getBookFolders(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      const [foldersResult, uncategorizedResult] = await Promise.all([
        db.execute(`
          SELECT f.path, COUNT(b.id) as count 
          FROM folders f 
          LEFT JOIN books b ON f.path = b.folder_path AND b.user_id = f.user_id 
          WHERE f.user_id = ? 
          GROUP BY f.path 
          ORDER BY f.path ASC
        `, [userId]),
        db.execute(`
          SELECT COUNT(*) as count 
          FROM books 
          WHERE user_id = ? AND (folder_path = '' OR folder_path IS NULL)
        `, [userId])
      ]);

      return utils.json({
        folders: foldersResult.rows,
        uncategorized: uncategorizedResult.rows[0].count
      });
    } catch (error) {
      return utils.error('获取书籍文件夹列表失败: ' + error.message, 500);
    }
  },

  async createFolder(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { path } = await request.json();

      if (!path) return utils.error('文件夹路径不能为空', 400);

      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      try {
        await db.execute(
          'INSERT INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)',
          [folderId, userId, path, utils.now()]
        );
        return utils.json({ success: true, message: '文件夹已创建', folder_id: folderId, path });
      } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
          return utils.error('文件夹已存在', 409);
        }
        throw error;
      }
    } catch (error) {
      return utils.error('创建文件夹失败: ' + error.message, 500);
    }
  },

  async deleteFolder(request, env, userId, params) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      let path = '';
      
      // 尝试从请求体获取路径
      try {
        const requestData = await request.json();
        path = requestData.path || '';
      } catch (e) {
        // 如果请求体解析失败，从URL参数获取
        const url = new URL(request.url);
        path = url.searchParams.get('path') || decodeURIComponent(params.path || '');
      }

      if (!path) return utils.error('文件夹路径不能为空', 400);

      // 验证文件夹是否属于该用户
      const folderResult = await db.execute(
        'SELECT id FROM folders WHERE user_id = ? AND path = ?',
        [userId, path]
      );

      if (folderResult.rows.length === 0) {
        return utils.error('文件夹不存在或无权删除', 404);
      }

      // 由于外键级联删除，删除文件夹中的书籍时章节会自动删除
      await db.batch([
        { sql: 'DELETE FROM books WHERE user_id = ? AND folder_path = ?', args: [userId, path] },
        { sql: 'DELETE FROM folders WHERE user_id = ? AND path = ?', args: [userId, path] }
      ]);

      console.log(`文件夹 ${path} 删除成功`);
      return utils.json({ success: true, message: '文件夹删除成功' });
    } catch (error) {
      console.error('删除文件夹失败:', error);
      return utils.error('删除文件夹失败: ' + error.message, 500);
    }
  },

  async getSystemSettings(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const settingsResult = await db.execute('SELECT key, value, updated_at FROM system_settings');
      return utils.json({
        success: true,
        settings: settingsResult.rows
      });
    } catch (error) {
      return utils.error('获取系统设置失败: ' + error.message);
    }
  },

  async updateSystemSettings(request, env, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const data = await request.json();

      if (!data || !data.key || typeof data.value === 'undefined') {
        return utils.error('缺少必要参数');
      }

      const validKeys = ['allow_registration', 'demo_mode'];
      if (!validKeys.includes(data.key)) {
        return utils.error('无效的设置键');
      }

      await db.execute(
        'INSERT OR REPLACE INTO system_settings(key, value, updated_at) VALUES(?, ?, ?)',
        [data.key, data.value, utils.now()]
      );

      return utils.json({
        success: true,
        message: '系统设置已更新'
      });
    } catch (error) {
      return utils.error('更新系统设置失败: ' + error.message);
    }
  }
};

const adminHandlers = {
  async getUsers(request, env, adminId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const usersResult = await db.execute(
        'SELECT id, username, created_at, account_status, is_admin FROM users ORDER BY created_at DESC'
      );
      return utils.json({ users: usersResult.rows });
    } catch (error) {
      return utils.error('获取用户列表失败', 500);
    }
  },

  async updateUserStatus(request, env, adminId, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const { status } = await request.json();

      if (!['active', 'disabled'].includes(status)) {
        return utils.error('无效的状态值');
      }
      if (userId === adminId) {
        return utils.error('不能修改自己的状态');
      }

      await db.execute('UPDATE users SET account_status = ? WHERE id = ?', [status, userId]);
      return utils.json({ message: '用户状态已更新' });
    } catch (error) {
      return utils.error('更新用户状态失败', 500);
    }
  },

  async deleteUser(request, env, adminId, userId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });

      if (userId === adminId) {
        return utils.error('不能删除自己的账号');
      }

      // 由于外键级联删除，只需要删除用户即可
      await db.execute('DELETE FROM users WHERE id = ?', [userId]);

      return utils.json({ message: '用户已删除' });
    } catch (error) {
      return utils.error('删除用户失败', 500);
    }
  },

  async getSettings(request, env, adminId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const settingsResult = await db.execute('SELECT key, value FROM system_settings');
      return utils.json({
        settings: Object.fromEntries(settingsResult.rows.map(s => [s.key, s.value]))
      });
    } catch (error) {
      return utils.error('获取系统设置失败', 500);
    }
  },

  async updateSettings(request, env, adminId) {
    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const updates = await request.json();

      const operations = [];
      const allowedKeys = ['allow_registration', 'demo_mode'];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedKeys.includes(key)) {
          operations.push({
            sql: 'INSERT OR REPLACE INTO system_settings(key, value, updated_at) VALUES(?, ?, ?)',
            args: [key, String(value), utils.now()]
          });
        }
      }

      if (operations.length > 0) {
        await db.batch(operations);
      }

      return utils.json({ message: '设置已更新' });
    } catch (error) {
      return utils.error('更新设置失败', 500);
    }
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    await initializeDatabase(env);

    const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
    const isDemoMode = await utils.isDemoMode(db);
    if (isDemoMode) {
      utils.cleanupDemoAccounts(db).catch(error => {
        console.error('演示模式清理失败:', error);
      });
    }
  } catch (error) {
    return utils.error('数据库初始化失败: ' + error.message, 500);
  }

  const route = utils.parseRoute(path);
  const isPublicRoute = (route.type === 'auth' && ['login', 'register'].includes(route.action)) ||
    (route.type === 'system' && route.action === 'settings' && method === 'GET') ||
    (route.type === 'videoproxy' && method === 'GET');

  if (!isPublicRoute) {
    const token = utils.parseAuthHeader(request.headers.get('Authorization'));
    if (!token) return utils.error('未授权: 缺少令牌', 401);

    try {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const tokenResult = await db.execute(
        'SELECT user_id, expiration FROM tokens WHERE token = ?', [token]
      );

      if (tokenResult.rows.length === 0) {
        return utils.error('未授权: 无效令牌', 401);
      }

      const tokenInfo = tokenResult.rows[0];
      if (Date.now() > tokenInfo.expiration) {
        await db.execute('DELETE FROM tokens WHERE token = ?', [token]);
        return utils.error('未授权: 令牌已过期', 401);
      }

      return await handleAuthenticatedRequest(request, env, route, method, tokenInfo.user_id, token);
    } catch (error) {
      return utils.error('令牌验证失败: ' + error.message, 500);
    }
  }

  return await handlePublicRequest(request, env, route, method);
}

async function handlePublicRequest(request, env, route, method) {
  if (route.type === 'auth') {
    if (route.action === 'login' && method === 'POST') {
      return await handlers.login(request, env);
    }
    if (route.action === 'register' && method === 'POST') {
      return await handlers.register(request, env);
    }
  }

  if (route.type === 'system' && route.action === 'settings' && method === 'GET') {
    return await handlers.getSystemSettings(request, env);
  }

  if (route.type === 'videoproxy' && method === 'GET') {
    return await handlers.getVideoProxy(request, env);
  }

  return utils.error('资源不存在或方法不允许', 404);
}

async function handleAuthenticatedRequest(request, env, route, method, userId, token) {
  try {
    if (route.type === 'admin') {
      const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN });
      const adminResult = await db.execute('SELECT is_admin FROM users WHERE id = ?', [userId]);

      if (!adminResult.rows[0]?.is_admin) {
        return utils.error('需要管理员权限', 403);
      }

      if (route.action === 'users' && method === 'GET') {
        return await adminHandlers.getUsers(request, env, userId);
      }
      if (route.action === 'users' && route.userId && method === 'PUT') {
        return await adminHandlers.updateUserStatus(request, env, userId, route.userId);
      }
      if (route.action === 'users' && route.userId && method === 'DELETE') {
        return await adminHandlers.deleteUser(request, env, userId, route.userId);
      }
      if (route.action === 'settings' && method === 'GET') {
        return await adminHandlers.getSettings(request, env, userId);
      }
      if (route.action === 'settings' && method === 'PUT') {
        return await adminHandlers.updateSettings(request, env, userId);
      }
    }

    const routeMap = {
      'auth/logout/POST': () => handlers.logout(request, env, userId, {}, token),
      'auth/delete-account/POST': () => handlers.deleteAccount(request, env, userId),
      'user/settings/GET': () => handlers.getUserSettings(request, env, userId),
      'user/settings/PUT': () => handlers.saveUserSettings(request, env, userId),
      'user/chapter-rules/GET': () => handlers.getChapterRules(request, env, userId),
      'user/chapter-rules/PUT': () => handlers.saveChapterRules(request, env, userId),
      'folders/list/GET': () => handlers.getBookFolders(request, env, userId),
      'folders/create/POST': () => handlers.createFolder(request, env, userId),
      'folders/delete/POST': () => handlers.deleteFolder(request, env, userId, route),
      'books/list/GET': () => handlers.getBooks(request, env, userId),
      'books/folders/GET': () => handlers.getBookFolders(request, env, userId),
      'books/create/POST': () => handlers.createBook(request, env, userId),
      'books/batch/POST': () => handlers.batchProcessBooks(request, env, userId),
      'system/settings/GET': () => handlers.getSystemSettings(request, env, userId),
      'system/settings/PUT': () => handlers.updateSystemSettings(request, env, userId),
    };

    const routeKey = `${route.type}/${route.action}/${method}`;
    if (routeMap[routeKey]) {
      return await routeMap[routeKey]();
    }

    if (route.type === 'books' && route.bookId) {
      const bookParams = { bookId: route.bookId, chapterIndex: route.chapterIndex };

      const bookRouteMap = {
        'info/GET': () => handlers.getBookInfo(request, env, userId, bookParams),
        'get/GET': () => handlers.getBookInfo(request, env, userId, bookParams),
        'update/PUT': () => handlers.updateBookInfo(request, env, userId, bookParams),
        'progress/PUT': () => handlers.updateBookProgress(request, env, userId, bookParams),
        'chapter/GET': () => handlers.getChapter(request, env, userId, bookParams),
        'get/DELETE': () => handlers.deleteBook(request, env, userId, bookParams),
      };

      const bookRouteKey = `${route.action}/${method}`;
      if (bookRouteMap[bookRouteKey]) {
        return await bookRouteMap[bookRouteKey]();
      }
    }

    return utils.error('找不到请求的资源或方法不允许', 404);
  } catch (error) {
    console.error('处理请求时出错:', error);
    return utils.error('处理请求失败: ' + error.message, 500);
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('处理请求时出错:', error);
      return utils.error('服务器内部错误: ' + error.message, 500);
    }
  }
};