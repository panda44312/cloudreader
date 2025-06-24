async function initializeDatabase(env) {
  const db = env.CLOUD_READER_DB;
  try {
    // 检查数据库连接
    try {
      await db.prepare("SELECT 1").first();
      console.log('数据库连接正常');
    } catch (dbError) {
      console.error('数据库连接测试失败:', dbError);
      throw new Error('数据库连接失败，请检查配置');
    }

    // 检查用户表是否存在
    const checkUsers = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
    if (!checkUsers) {
      console.log('正在初始化数据库表...');
      // 创建表的SQL语句数组
      const statements = [
        // users表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT,
            is_admin BOOLEAN DEFAULT 0,
            account_status TEXT DEFAULT 'active'
          )
        `),
        // user_settings表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            settings_data TEXT,
            updated_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // user_chapter_rules表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS user_chapter_rules (
            user_id TEXT PRIMARY KEY,
            data TEXT,
            updated_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // books表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            author TEXT,
            chapter_count INTEGER DEFAULT 0,
            last_read_chapter INTEGER DEFAULT 0,
            last_read_position INTEGER DEFAULT 0,
            created_at TEXT,
            last_read_time TEXT,
            is_public BOOLEAN DEFAULT 0,
            folder_path TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // chapters表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            book_id TEXT,
            user_id TEXT,
            title TEXT,
            chapter_index INTEGER,
            created_at TEXT,
            has_content BOOLEAN DEFAULT 1,
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // chapter_contents表 - 用于存储分块的章节内容
        db.prepare(`
          CREATE TABLE IF NOT EXISTS chapter_contents (
            id TEXT PRIMARY KEY,
            chapter_id TEXT,
            user_id TEXT,
            content_index INTEGER,
            content TEXT,
            created_at TEXT,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // tokens表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            expiration INTEGER,
            created_at TEXT,
            last_used_at TEXT,
            user_agent TEXT,
            ip_address TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
          )
        `),
        // folders表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            path TEXT,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(user_id, path)
          )
        `),
        // system_settings表
        db.prepare(`
          CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT,
            updated_by TEXT
          )
        `)
      ];

      // 使用D1的批处理API执行所有建表语句
      await db.batch(statements);

      // 设置系统默认配置
      const systemSettings = [
        { key: 'allow_registration', value: 'true' },
        { key: 'demo_mode', value: 'false' } // 演示模式配置
      ];

      const settingStatements = [];
      for (const setting of systemSettings) {
        settingStatements.push(
          db.prepare(`INSERT INTO system_settings(key, value, updated_at, updated_by) VALUES(?, ?, ?, 'system')`)
            .bind(setting.key, setting.value, utils.now())
        );
      }

      if (settingStatements.length > 0) {
        await db.batch(settingStatements);
      }

      console.log('数据库表创建完成');
    } else {
      console.log('数据库表已存在，跳过初始化');

      // 此处存储数据库升级逻辑
      // TODO
    }

    return true;
  }
  catch (error) {
    console.error('初始化数据库失败:', error);
    // 返回适当的错误，而不是直接抛出，让调用者决定如何处理
    return { error: error.message };
  }
}

const utils = {

  generateToken() {
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    return Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  parseAuthHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  },

  // 新增加密相关函数
  crypto: {
    // 使用密码加密内容，完全兼容CryptoJS.AES.encrypt输出格式
    async encrypt(content, password) {
      try {
        if (!content) return content;

        // 生成8字节的随机盐值
        const salt = crypto.getRandomValues(new Uint8Array(8));

        // 使用与CryptoJS相同的密钥派生过程
        // CryptoJS使用OpenSSL的EVP_BytesToKey方法
        const keyAndIV = await this.deriveKeyAndIV(password, salt);
        const { derivedKey, iv } = keyAndIV;

        // 使用AES-CBC进行加密
        const key = await crypto.subtle.importKey(
          'raw',
          derivedKey,
          { name: 'AES-CBC' },
          false,
          ['encrypt']
        );

        // 加密内容
        const contentUtf8 = new TextEncoder().encode(content);
        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: 'AES-CBC', iv },
          key,
          contentUtf8
        );

        // 构建OpenSSL格式数据:
        // "Salted__" + salt + ciphertext
        const headerBytes = new TextEncoder().encode("Salted__");
        const resultBytes = new Uint8Array(headerBytes.length + salt.length + encryptedBuffer.byteLength);

        resultBytes.set(headerBytes, 0);
        resultBytes.set(salt, headerBytes.length);
        resultBytes.set(new Uint8Array(encryptedBuffer), headerBytes.length + salt.length);

        // 整个结果用Base64编码
        return this.arrayBufferToBase64(resultBytes);
      } catch (error) {
        console.error('加密失败:', error);
        throw new Error('加密失败: ' + error.message);
      }
    },

    // 使用与CryptoJS兼容的方法从密码和盐值派生密钥和IV
    async deriveKeyAndIV(password, salt) {
      const enc = new TextEncoder();
      const passwordBytes = enc.encode(password);

      // 使用MD5哈希模拟OpenSSL的EVP_BytesToKey方法
      // CryptoJS和OpenSSL都使用类似算法
      const concatBytes = (arrays) => {
        let totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        let result = new Uint8Array(totalLength);
        let offset = 0;
        for (let arr of arrays) {
          result.set(arr, offset);
          offset += arr.length;
        }
        return result;
      };

      // MD5哈希函数
      const md5 = async (data) => {
        const hashBuffer = await crypto.subtle.digest('MD5', data);
        return new Uint8Array(hashBuffer);
      };

      // 派生密钥和IV (类似于OpenSSL的EVP_BytesToKey)
      let derivedData = new Uint8Array(0);
      let material = new Uint8Array(0);

      // 获取48字节 (32字节密钥+16字节IV)
      while (derivedData.length < 48) {
        const data = concatBytes([material, passwordBytes, salt]);
        material = await md5(data);
        derivedData = concatBytes([derivedData, material]);
      }

      // 分割结果：前32字节作为密钥，后16字节作为IV
      return {
        derivedKey: derivedData.slice(0, 32),
        iv: derivedData.slice(32, 48)
      };
    },

    // 将ArrayBuffer转换为Base64字符串
    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  },

  parseAuthHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  },

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
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
    if (!path || path === '/') {
      return { type: 'root' };
    }

    const parts = path.split('/').filter(Boolean);

    // 视频代理
    if (parts[0] === 'videoproxy') {
      return {
        type: 'videoproxy',
        action: parts[1] || 'fetch'
      };
    }

    if (parts[0] === 'auth') {
      return {
        type: 'auth',
        action: parts[1] || 'status'
      };
    }

    if (parts[0] === 'admin') {
      if (parts[1] === 'users') {
        if (parts.length === 2) {
          return { type: 'admin', action: 'users' };
        }
        if (parts.length === 3) {
          return { type: 'admin', action: 'users', userId: parts[2] };
        }
      }
      if (parts[1] === 'settings') {
        return { type: 'admin', action: 'settings' };
      }
    }

    if (parts[0] === 'user') {
      return { type: 'user', action: parts[1] || 'default', subaction: parts[2] || null };
    }

    if (parts[0] === 'system') {
      return { type: 'system', action: parts[1] || 'settings' };
    }

    if (parts[0] === 'folders') {
      if (parts.length === 1) {
        return { type: 'folders', action: 'list' };
      }
      if (parts[1] === 'create') {
        return { type: 'folders', action: 'create' };
      }
      if (parts[1] === 'rename') {
        return { type: 'folders', action: 'rename', path: parts[2] || null };
      }
      if (parts[1] === 'delete') {
        return { type: 'folders', action: 'delete', path: parts[2] || null };
      }
    }

    if (parts[0] === 'books') {
      if (parts.length === 1) {
        return { type: 'books', action: 'list' };
      }
      if (parts[1] === 'create') {
        return { type: 'books', action: 'create' };
      }
      if (parts[1] === 'folders') {
        return { type: 'books', action: 'folders' };
      }
      if (parts[1] === 'batch') {
        return { type: 'books', action: 'batch' };
      }
      if (parts[1] === 'upload-content') {
        return { type: 'books', action: 'upload-content' };
      }

      const bookId = parts[1];
      if (parts.length === 2) {
        return { type: 'books', action: 'get', bookId };
      }
      if (parts[2] === 'info') {
        return { type: 'books', action: 'info', bookId };
      }
      if (parts[2] === 'update') {
        return { type: 'books', action: 'update', bookId };
      }
      if (parts[2] === 'progress') {
        return { type: 'books', action: 'progress', bookId };
      }
      if (parts[2] === 'upload-content') {
        return { type: 'books', action: 'upload-content', bookId };
      }
      if (parts[2] === 'chapters') {
        if (parts.length === 3) {
          return { type: 'books', action: 'chapters', bookId };
        }
        return { type: 'books', action: 'chapter', bookId, chapterIndex: parts[3] };
      }
    }

    if (parts[0] === 'get') {
      return { type: 'get', path: parts.slice(1).join('/') };
    }

    return { type: 'unknown', path };
  },

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] ${message}`, JSON.stringify(data));
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  },

  security: {
    validatePasswordStrength(password) {
      if (!password || password.length < 8) {
        return { valid: false, message: '密码长度至少需要8位' };
      }
      if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
        return { valid: false, message: '密码需要包含数字和字母' };
      }
      return { valid: true };
    },

    sanitizeInput(input) {
      if (typeof input !== 'string') return input;
      return input.replace(/'/g, "''").trim();
    },

    validateFileName(filename) {
      if (!filename) return false;
      return !/[\\\/\:\*\?\"\<\>\|]/.test(filename);
    },

    async getSystemSetting(db, key) {
      try {
        const setting = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first();
        return setting ? setting.value : null;
      } catch (error) {
        console.error(`获取系统设置 ${key} 失败:`, error);
        return null;
      }
    },

    async updateSystemSetting(db, key, value, userId) {
      try {
        const existing = await db.prepare('SELECT key FROM system_settings WHERE key = ?').bind(key).first();

        if (existing) {
          await db.prepare('UPDATE system_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?').bind(
            value, utils.now(), userId, key
          ).run();
        } else {
          await db.prepare('INSERT INTO system_settings(key, value, updated_at, updated_by) VALUES(?, ?, ?, ?)').bind(
            key, value, utils.now(), userId
          ).run();
        }

        return true;
      } catch (error) {
        console.error(`更新系统设置 ${key} 失败:`, error);
        return false;
      }
    },

    // 检查是否处于演示模式
    async isDemoMode(db) {
      const demoMode = await utils.security.getSystemSetting(db, 'demo_mode');
      return demoMode === 'true';
    },

    // 清理演示账户
    async cleanupDemoAccounts(db) {
      try {
        const isDemoMode = await utils.security.isDemoMode(db);
        if (!isDemoMode) {
          return false;
        }

        // 获取所有非管理员账户
        const nonAdminUsers = await db.prepare('SELECT id FROM users WHERE is_admin = 0').all();
        const statements = [];

        // 获取24小时前的时间戳
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString();

        for (const user of nonAdminUsers.results) {
          // 检查是否是超过24小时的账户
          const userCreatedAt = await db.prepare('SELECT created_at FROM users WHERE id = ?').bind(user.id).first();

          if (userCreatedAt && userCreatedAt.created_at < yesterdayStr) {
            statements.push(db.prepare('DELETE FROM tokens WHERE user_id = ?').bind(user.id));
            statements.push(db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id));
            statements.push(db.prepare('DELETE FROM user_chapter_rules WHERE user_id = ?').bind(user.id));
            statements.push(db.prepare('DELETE FROM folders WHERE user_id = ?').bind(user.id));

            const books = await db.prepare('SELECT id FROM books WHERE user_id = ?').bind(user.id).all();
            if (books.results && books.results.length > 0) {
              for (const book of books.results) {
                statements.push(db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(book.id));
                statements.push(db.prepare('DELETE FROM books WHERE id = ?').bind(book.id));
              }
            }

            statements.push(db.prepare('DELETE FROM users WHERE id = ?').bind(user.id));
          }
        }

        if (statements.length > 0) {
          await db.batch(statements);
          console.log(`演示模式：已清理 ${statements.length} 个超过24小时的非管理员账户相关数据`);
          return true;
        }

        return false;
      } catch (error) {
        console.error('清理演示账户失败:', error);
        return false;
      }
    }
  },

  isAdmin(db, userId) {
    return db.prepare('SELECT is_admin FROM users WHERE id = ?').bind(userId).first();
  },

  // 格式化文件大小为易读格式
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

};

const handlers = {

  async register(request, env) {
    try {
      const db = env.CLOUD_READER_DB;

      // 检查是否允许注册
      const allowRegistration = await utils.security.getSystemSetting(db, 'allow_registration');
      if (allowRegistration === 'false') {
        return utils.error('管理员已关闭注册功能，请联系管理员', 403);
      }

      const data = await request.json();

      // 验证用户名和密码格式
      if (!data.username || !data.password_hash) {
        return utils.error('用户名和密码不能为空');
      }

      if (data.username.length < 2 || data.username.length > 20) {
        return utils.error('用户名长度应在2-20个字符之间');
      }

      // 检测用户名安全性，避免XSS等注入
      const sanitizedUsername = utils.security.sanitizeInput(data.username);
      if (sanitizedUsername !== data.username) {
        return utils.error('用户名包含不允许的字符');
      }

      // 检查用户名是否已存在
      const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').bind(data.username).first();
      if (existingUser) {
        return utils.error('用户名已存在');
      }

      // 创建用户
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const isFirstUser = (await db.prepare('SELECT COUNT(*) as count FROM users').first()).count === 0;

      await db.prepare(`
        INSERT INTO users(id, username, password_hash, created_at, is_admin)
        VALUES(?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.username,
        data.password_hash,
        utils.now(),
        isFirstUser ? 1 : 0 // 如果是第一个用户，设为管理员
      ).run();

      // 创建默认用户设置
      const defaultSettings = {
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
        primaryColor: '#5D5CDE'
      };

      await db.prepare(`
        INSERT INTO user_settings(user_id, settings_data, updated_at)
        VALUES(?, ?, ?)
      `).bind(
        userId,
        JSON.stringify(defaultSettings),
        utils.now()
      ).run();

      // 生成认证令牌
      const token = utils.generateToken();
      const tokenExpiration = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30天

      await db.prepare(`
        INSERT INTO tokens(token, user_id, expiration, created_at, last_used_at, user_agent, ip_address)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `).bind(
        token,
        userId,
        tokenExpiration,
        utils.now(),
        utils.now(),
        request.headers.get('User-Agent') || 'unknown',
        request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown'
      ).run();


      return utils.json({
        success: true,
        message: '注册成功',
        id: userId,
        username: data.username,
        isAdmin: isFirstUser,
        token: token
      });
    } catch (error) {
      console.error('注册失败:', error);
      return utils.error('注册失败：' + error.message);
    }
  },

  async login(request, env) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { username, password_hash } = data;

      if (!username || !password_hash) {
        return utils.error('用户名和密码不能为空');
      }

      const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();

      if (!user) {
        return utils.error('用户不存在', 404);
      }

      if (user.account_status !== 'active' && user.account_status) {
        return utils.error('账号已被禁用', 403);
      }

      if (user.password_hash !== password_hash) {
        return utils.error('密码错误', 401);
      }

      const token = utils.generateToken();
      const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天过期
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
      const userAgent = request.headers.get('User-Agent') || 'unknown';

      await db.prepare(`
        INSERT INTO tokens(token, user_id, expiration, created_at, last_used_at, user_agent, ip_address)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `).bind(token, user.id, expiration, utils.now(), utils.now(), userAgent, ip).run();

      return utils.json({
        success: true,
        token,
        user_id: user.id,
        username: user.username,
        created_at: user.created_at,
        is_admin: user.is_admin === 1
      });
    } catch (error) {
      console.error('登录失败:', error);
      return utils.error('登录失败: ' + error.message, 500);
    }
  },

  async logout(request, env, userId, params, token) {
    try {
      const db = env.CLOUD_READER_DB;
      await db.prepare('DELETE FROM tokens WHERE token = ?').bind(token).run();

      return utils.json({
        success: true,
        message: '登出成功'
      });
    } catch (error) {
      console.error('登出失败:', error);
      return utils.error('登出失败: ' + error.message, 500);
    }
  },

  async getVideoProxy(request, env) {
    const url = new URL(request.url);
    const targetUrlParam = url.searchParams.get('target');
    if (!targetUrlParam) {
      return new Response('缺少target参数', { status: 400 });
    }

    const decodedTargetUrl = decodeURIComponent(targetUrlParam);
    const response = await fetch(decodedTargetUrl, {
      method: 'GET',
      headers: {
        // 添加常见的浏览器请求头
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': new URL(decodedTargetUrl).origin,
        'Origin': new URL(decodedTargetUrl).origin
      }
    });

    // 复制响应头
    const newHeaders = new Headers();
    // 设置CORS头部
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    newHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  },

  async deleteAccount(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { password_hash } = data;

      if (!password_hash) {
        return utils.error('密码哈希值不能为空', 400);
      }

      // 验证用户密码
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

      if (!user) {
        return utils.error('用户不存在', 404);
      }

      if (user.password_hash !== password_hash) {
        return utils.error('密码错误', 401);
      }

      // 使用批处理一次性删除所有相关数据
      const statements = [];

      // 1. 删除章节内容和章节 - 直接通过user_id
      statements.push(db.prepare('DELETE FROM chapter_contents WHERE user_id = ?').bind(userId));
      statements.push(db.prepare('DELETE FROM chapters WHERE user_id = ?').bind(userId));

      // 2. 删除书籍和其他用户数据
      statements.push(db.prepare('DELETE FROM books WHERE user_id = ?').bind(userId));
      statements.push(db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId));
      statements.push(db.prepare('DELETE FROM user_chapter_rules WHERE user_id = ?').bind(userId));
      statements.push(db.prepare('DELETE FROM tokens WHERE user_id = ?').bind(userId));
      statements.push(db.prepare('DELETE FROM folders WHERE user_id = ?').bind(userId));

      // 3. 最后删除用户本身
      statements.push(db.prepare('DELETE FROM users WHERE id = ?').bind(userId));

      // 批量执行所有删除操作
      await db.batch(statements);

      return utils.json({ message: '用户已删除' });
    } catch (error) {
      console.error('删除账号失败:', error);
      return utils.error('删除账号失败: ' + error.message, 500);
    }
  },

  async getUserSettings(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const settings = await db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').bind(userId).first();

      return utils.json({
        settings_data: settings?.settings_data || null
      });
    } catch (error) {
      console.error('获取用户设置失败', error);
      return utils.error('获取用户设置失败: ' + error.message, 500);
    }
  },

  async saveUserSettings(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { settings_data } = data;

      const statements = [];

      if (settings_data) {
        const existing = await db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').bind(userId).first();

        if (existing) {
          statements.push(db.prepare('UPDATE user_settings SET settings_data = ?, updated_at = ? WHERE user_id = ?').bind(
            settings_data, utils.now(), userId
          ));
        } else {
          statements.push(
            db.prepare('INSERT INTO user_settings(user_id, settings_data, updated_at) VALUES(?, ?, ?)').bind(
              userId, settings_data, utils.now()
            )
          );
        }
      }

      if (statements.length > 0) {
        await db.batch(statements);
      }

      return utils.json({
        success: true,
        message: '设置已保存'
      });
    } catch (error) {
      console.error('保存设置失败:', error);
      return utils.error('保存设置失败: ' + error.message, 500);
    }
  },

  async saveChapterRules(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;

      // 验证请求数据
      const data = await request.json();
      if (!data || !data.data) {
        return utils.error('无效的章节规则数据');
      }

      // 检查用户是否已有规则记录
      const existingRules = await db.prepare('SELECT * FROM user_chapter_rules WHERE user_id = ?').bind(userId).first();
      const now = utils.now();

      if (existingRules) {
        // 更新现有规则
        await db.prepare('UPDATE user_chapter_rules SET data = ?, updated_at = ? WHERE user_id = ?').bind(
          data.data, now, userId
        ).run();
      } else {
        // 创建新规则记录
        await db.prepare('INSERT INTO user_chapter_rules(user_id, data, updated_at) VALUES(?, ?, ?)').bind(
          userId, data.data, now
        ).run();
      }

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
      const db = env.CLOUD_READER_DB;

      // 获取用户规则
      const userRules = await db.prepare('SELECT data FROM user_chapter_rules WHERE user_id = ?').bind(userId).first();

      return utils.json({
        success: true,
        data: userRules?.data || null
      });
    } catch (error) {
      console.error('获取章节规则失败:', error);
      return utils.error('获取章节规则失败: ' + error.message);
    }
  },

  async syncUserData(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { settings_data } = data;

      const statements = [];
      const now = utils.now();

      if (settings_data) {
        const existingSettings = await db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').bind(userId).first();

        if (existingSettings) {
          statements.push(db.prepare('UPDATE user_settings SET settings_data = ?, updated_at = ? WHERE user_id = ?').bind(
            settings_data, now, userId
          ));
        } else {
          statements.push(
            db.prepare('INSERT INTO user_settings(user_id, settings_data, updated_at) VALUES(?, ?, ?)').bind(
              userId, settings_data, now
            )
          );
        }
      }

      if (statements.length > 0) {
        await db.batch(statements);
      }

      return utils.json({
        success: true,
        message: '数据已同步'
      });
    } catch (error) {
      console.error('同步数据失败:', error);
      return utils.error('同步数据失败: ' + error.message, 500);
    }
  },

  async getBooks(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const url = new URL(request.url);
      const folderPath = url.searchParams.get('folder') !== null ? url.searchParams.get('folder') : '';
      const sanitizedFolder = utils.security.sanitizeInput(folderPath);

      let query = `
        SELECT id, title, author, last_read_chapter, last_read_position, last_read_time, created_at, chapter_count, folder_path, file_size
        FROM books 
        WHERE user_id = ?
      `;

      const params = [userId];

      if (sanitizedFolder === "") {
        // 返回所有书籍，不添加条件
      } else if (sanitizedFolder === "uncategorized") {
        // 返回未分类书籍
        query += ' AND (folder_path = \'\' OR folder_path IS NULL)';
      } else {
        // 返回特定文件夹的书籍
        query += ' AND folder_path = ?';
        params.push(sanitizedFolder);
      }

      query += ' ORDER BY last_read_time DESC NULLS LAST';

      const books = await db.prepare(query).bind(...params).all();

      // 添加格式化的文件大小
      const booksWithFormattedSize = books.results.map(book => ({
        ...book,
        formatted_size: utils.formatFileSize(book.file_size || 0)
      }));

      return utils.json({
        books: booksWithFormattedSize
      });
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      return utils.error('获取书籍列表失败: ' + error.message, 500);
    }
  },

  async getBookInfo(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const bookId = params.bookId;

      const book = await db.prepare(`
        SELECT id, title, author, last_read_chapter, last_read_position, last_read_time, chapter_count, user_id, folder_path, file_size
        FROM books
        WHERE id = ?
      `).bind(bookId).first();

      if (!book) {
        return utils.error('未找到书籍', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权访问此书籍', 403);
      }

      const chapters = await db.prepare(`
        SELECT id, title, chapter_index
        FROM chapters
        WHERE book_id = ?
        ORDER BY chapter_index ASC
      `).bind(bookId).all();

      // 检测是否是加密章节（简单检查第一个章节的标题）
      let isEncrypted = false;
      if (chapters.results && chapters.results.length > 0) {
        const firstChapter = chapters.results[0];
        // 检测是否是Base64格式的加密数据（以"U2FsdGVk"开头，这是"Salted__"的Base64编码开头）
        isEncrypted = firstChapter.title && (
          firstChapter.title.startsWith("U2FsdGVk") ||
          // 很长的标题也可能是加密的
          firstChapter.title.length > 100
        );
      }

      return utils.json({
        book: {
          id: book.id,
          title: book.title,
          author: book.author,
          last_read_chapter: book.last_read_chapter,
          last_read_position: book.last_read_position,
          last_read_time: book.last_read_time,
          chapter_count: book.chapter_count,
          folder_path: book.folder_path || '',
          file_size: book.file_size || 0,
          formatted_size: utils.formatFileSize(book.file_size || 0),
          chapters: chapters.results,
          isEncrypted: isEncrypted // 添加加密标志
        }
      });
    } catch (error) {
      console.error('获取书籍信息失败:', error);
      return utils.error('获取书籍信息失败: ' + error.message, 500);
    }
  },

  async getChapter(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const { bookId, chapterIndex } = params;

      const book = await db.prepare('SELECT user_id FROM books WHERE id = ?').bind(bookId).first();

      if (!book) {
        return utils.error('未找到书籍', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权访问此书籍', 403);
      }

      const chapter = await db.prepare(`
        SELECT id, title, chapter_index, has_content
        FROM chapters
        WHERE book_id = ? AND chapter_index = ?
      `).bind(bookId, parseInt(chapterIndex)).first();

      if (!chapter) {
        return utils.error('章节不存在', 404);
      }

      // 获取章节内容
      let content = '';
      if (chapter.has_content) {
        // 获取所有内容块并按顺序合并
        const contentChunks = await db.prepare(`
          SELECT content
          FROM chapter_contents
          WHERE chapter_id = ?
          ORDER BY content_index ASC
        `).bind(chapter.id).all();

        if (contentChunks && contentChunks.results && contentChunks.results.length > 0) {
          content = contentChunks.results.map(chunk => chunk.content).join('');
        } else {
          // 兼容旧版本：如果没有在章节内容表中找到，尝试从chapters表获取
          const chapterContent = await db.prepare(`
            SELECT content 
            FROM chapters 
            WHERE id = ?
          `).bind(chapter.id).first();

          if (chapterContent) {
            content = chapterContent.content || '';
          }
        }
      }

      // 返回章节信息和合并后的内容
      return utils.json({
        chapter: {
          id: chapter.id,
          title: chapter.title,
          content: content,
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
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { title, author, folder_path } = data;

      if (!title) {
        return utils.error('书籍标题不能为空', 400);
      }

      // 创建书籍
      const bookId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = utils.now();
      const sanitizedFolder = folder_path ? utils.security.sanitizeInput(folder_path) : '';

      await db.prepare(`
        INSERT INTO books(
          id, user_id, title, author, chapter_count, last_read_chapter,
          last_read_position, created_at, last_read_time, folder_path
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        bookId, userId, title, author || '', 0, 0, 0, now, now, sanitizedFolder
      ).run();

      // 如果文件夹不存在，创建它（除非是空文件夹）
      if (sanitizedFolder) {
        try {
          const existingFolder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, sanitizedFolder).first();

          if (!existingFolder) {
            const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            await db.prepare('INSERT INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)')
              .bind(folderId, userId, sanitizedFolder, now).run();
          }
        } catch (error) {
          console.error('创建文件夹失败:', error);
          // 继续执行，不影响书籍创建
        }
      }

      return utils.json({
        success: true,
        message: '书籍已创建',
        book_id: bookId
      });
    } catch (error) {
      console.error('创建书籍失败:', error);
      return utils.error('创建书籍失败: ' + error.message, 500);
    }
  },

  // 处理服务器端章节解析和上传
  async uploadBookContent(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const bookId = params.bookId;

      // 验证书籍所有权
      const book = await db.prepare('SELECT user_id, title, chapter_count FROM books WHERE id = ?').bind(bookId).first();
      if (!book) {
        return utils.error('书籍不存在', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权操作此书籍', 403);
      }

      // 处理请求数据
      const data = await request.json();
      const { chapters, chapter_count, upload_id, chunk_index, total_chunks, file_size, is_last_chunk } = data;

      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return utils.error('缺少章节数据', 400);
      }

      // 处理分块上传 - 当前是分块上传的一部分
      if (chunk_index !== undefined && total_chunks !== undefined) {
        // 内容分块大小（字节）
        const CHUNK_SIZE = 500000; // 约500KB，减小单次处理量
        const now = utils.now();

        // 使用传入的章节数据，这些应该只是当前分块的章节
        const currentChapters = chapters;
        // 计算本次上传的章节在整体中的索引范围
        const chaptersPerChunk = Math.ceil(chapter_count / total_chunks);
        const startIdx = chunk_index * chaptersPerChunk;
        // 这些章节的实际索引应该从startIdx开始

        // 如果是第一个分块，先清理旧数据
        if (chunk_index === 0) {
          // 先删除可能存在的旧章节和内容
          await db.prepare('DELETE FROM chapter_contents WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').bind(bookId).run();
          await db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(bookId).run();
        } else {
          // 非第一个分块，检查当前分块的章节是否已存在
          // 计算当前分块的章节范围
          const chaptersPerChunk = Math.ceil(chapter_count / total_chunks);
          const startIdx = chunk_index * chaptersPerChunk;
          const endIdx = Math.min(startIdx + chaptersPerChunk, chapter_count);

          // 检查这个范围的章节是否已存在
          for (let i = startIdx; i < endIdx; i++) {
            const chapterId = `chapter_${bookId}_${i}`;
            const existingChapter = await db.prepare('SELECT id FROM chapters WHERE id = ?').bind(chapterId).first();

            if (existingChapter) {
              // 如果章节已存在，删除它的内容和章节记录
              await db.prepare('DELETE FROM chapter_contents WHERE chapter_id = ?').bind(chapterId).run();
              await db.prepare('DELETE FROM chapters WHERE id = ?').bind(chapterId).run();
            }
          }
        }

        // 分批处理章节，避免一次性处理太多数据
        const MAX_BATCH_SIZE = 20; // 每批最多处理的语句数
        let batchStatements = [];

        // 处理当前分块的章节
        for (let i = 0; i < currentChapters.length; i++) {
          const chapterIndex = startIdx + i;
          const chapterId = `chapter_${bookId}_${chapterIndex}`;
          const chapter = currentChapters[i];
          const hasContent = chapter.content && chapter.content.length > 0;

          console.log(`处理章节 ${i + 1}/${currentChapters.length}(总索引:${chapterIndex})`);

          // 插入章节基本信息
          batchStatements.push(
            db.prepare(`
              INSERT INTO chapters(id, book_id, user_id, title, chapter_index, created_at, has_content)
              VALUES(?, ?, ?, ?, ?, ?, ?)
            `).bind(
              chapterId,
              bookId,
              userId,
              chapter.title,
              chapterIndex,
              now,
              hasContent ? 1 : 0
            )
          );

          // 当批处理达到最大大小时执行
          if (batchStatements.length >= MAX_BATCH_SIZE) {
            await db.batch(batchStatements);
            batchStatements = [];
          }

          // 处理章节内容
          if (hasContent) {
            const content = chapter.content;
            const contentSize = new TextEncoder().encode(content).length;

            // 始终进行内容分块处理，不管大小
            const CHUNK_SIZE = 1024 * 1024; // 1MB 分块大小
            const totalContentChunks = Math.ceil(contentSize / CHUNK_SIZE);

            for (let j = 0; j < totalContentChunks; j++) {
              const start = j * CHUNK_SIZE;
              const end = Math.min((j + 1) * CHUNK_SIZE, content.length);
              const contentChunk = content.substring(start, end);
              const contentId = `content_${chapterId}_${j}`;

              batchStatements.push(
                db.prepare(`
                  INSERT INTO chapter_contents(id, chapter_id, user_id, content_index, content, created_at)
                  VALUES(?, ?, ?, ?, ?, ?)
                `).bind(
                  contentId,
                  chapterId,
                  userId,
                  j,
                  contentChunk,
                  now
                )
              );

              // 当批处理达到最大大小时执行
              if (batchStatements.length >= MAX_BATCH_SIZE) {
                await db.batch(batchStatements);
                batchStatements = [];
              }
            }
          }
        }

        // 执行剩余的批处理语句
        if (batchStatements.length > 0) {
          await db.batch(batchStatements);
        }

        // 如果是最后一个分块，更新书籍信息
        if (is_last_chunk || chunk_index === total_chunks - 1) {
          // 使用前端传递的文件大小，不再在后端计算
          await db.prepare('UPDATE books SET chapter_count = ?, file_size = ? WHERE id = ?')
            .bind(chapter_count, file_size || 0, bookId)
            .run();
        }

        // 返回当前分块处理结果
        return utils.json({
          success: true,
          message: `分块 ${chunk_index + 1}/${total_chunks} 上传成功`,
          chunk_index: chunk_index,
          total_chunks: total_chunks,
          is_complete: chunk_index === total_chunks - 1
        });
      }
      // 兼容旧版本 - 一次性上传所有内容
      else {
        return utils.error('不支持一次性上传所有内容', 400);
      }
    } catch (error) {
      console.error('上传内容失败:', error);
      return utils.error('上传内容失败: ' + error.message, 500);
    }
  },

  async updateBookInfo(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const bookId = params.bookId;
      const data = await request.json();
      const { title, author, folder_path } = data;

      if (!title) {
        return utils.error('书籍标题不能为空', 400);
      }

      const book = await db.prepare('SELECT user_id, folder_path FROM books WHERE id = ?').bind(bookId).first();

      if (!book) {
        return utils.error('未找到书籍', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权访问此书籍', 403);
      }

      const sanitizedFolder = folder_path !== undefined ? utils.security.sanitizeInput(folder_path) : null;

      let query, parameters;

      if (sanitizedFolder !== null) {
        query = `UPDATE books SET title = ?, author = ?, folder_path = ? WHERE id = ?`;
        parameters = [title, author || '', sanitizedFolder, bookId];
      } else {
        query = `UPDATE books SET title = ?, author = ? WHERE id = ?`;
        parameters = [title, author || '', bookId];
      }

      await db.prepare(query).bind(...parameters).run();

      // 如果更改了文件夹，并且新文件夹不存在，则创建它
      if (sanitizedFolder !== null && sanitizedFolder !== book.folder_path && sanitizedFolder !== '') {
        try {
          const existingFolder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, sanitizedFolder).first();

          if (!existingFolder) {
            const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            await db.prepare('INSERT INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)')
              .bind(folderId, userId, sanitizedFolder, utils.now()).run();
          }
        } catch (error) {
          console.error('创建文件夹失败:', error);
          // 继续执行，不影响书籍更新
        }
      }

      return utils.json({
        success: true,
        message: '书籍信息已更新'
      });
    } catch (error) {
      console.error('更新书籍信息失败:', error);
      return utils.error('更新书籍信息失败: ' + error.message, 500);
    }
  },

  async updateBookProgress(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const bookId = params.bookId;
      const data = await request.json();
      const { chapter_index, position } = data;

      if (chapter_index === undefined) {
        return utils.error('进度数据不完整', 400);
      }

      const book = await db.prepare('SELECT user_id FROM books WHERE id = ?').bind(bookId).first();

      if (!book) {
        return utils.error('未找到书籍', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权访问此书籍', 403);
      }

      await db.prepare(`
        UPDATE books
        SET last_read_chapter = ?, last_read_position = ?, last_read_time = ?
        WHERE id = ?
      `).bind(chapter_index, position || 0, utils.now(), bookId).run();

      return utils.json({
        success: true,
        message: '阅读进度已更新'
      });
    } catch (error) {
      console.error('更新阅读进度失败:', error);
      return utils.error('更新阅读进度失败: ' + error.message, 500);
    }
  },

  async deleteBook(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;
      const bookId = params.bookId;

      const book = await db.prepare('SELECT user_id, title FROM books WHERE id = ?').bind(bookId).first();

      if (!book) {
        return utils.error('未找到书籍', 404);
      }

      if (book.user_id !== userId) {
        return utils.error('无权删除此书籍', 403);
      }

      // 优化：使用批处理一次性删除所有相关数据
      const statements = [];

      // 直接删除章节内容，使用user_id和book_id组合条件提高效率
      statements.push(
        db.prepare('DELETE FROM chapter_contents WHERE user_id = ? AND chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)')
          .bind(userId, bookId)
      );

      // 删除章节
      statements.push(
        db.prepare('DELETE FROM chapters WHERE user_id = ? AND book_id = ?')
          .bind(userId, bookId)
      );

      // 删除书籍
      statements.push(
        db.prepare('DELETE FROM books WHERE id = ? AND user_id = ?')
          .bind(bookId, userId)
      );

      await db.batch(statements);

      return utils.json({
        success: true,
        message: '书籍已删除'
      });
    } catch (error) {
      console.error('删除书籍失败:', error);
      return utils.error('删除书籍失败: ' + error.message, 500);
    }
  },

  // 批量处理书籍
  // 删除文件夹及其中的书籍
  async deleteFolder(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { path, force_delete = false, empty_folder = false } = data;

      if (!path && path !== '') {
        return utils.error('缺少文件夹路径', 400);
      }

      // 验证文件夹存在性和所有权
      const folder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
        .bind(userId, path)
        .first();

      // 如果是直接删除空文件夹的请求
      if (empty_folder || force_delete) {
        if (path !== '') {
          await db.prepare('DELETE FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, path)
            .run();
        }

        return utils.json({
          success: true,
          message: '文件夹删除成功',
          deleted_books: 0,
          complete: true
        });
      }

      // 获取要删除的书籍数量
      const batch_size = data.batch_size || 20;
      const offset = data.offset || 0;

      // 获取文件夹中的书籍
      const books = await db.prepare('SELECT id FROM books WHERE user_id = ? AND folder_path = ? LIMIT ? OFFSET ?')
        .bind(userId, path, batch_size, offset)
        .all();

      // 如果没有书籍，直接删除文件夹
      if (!books.results || books.results.length === 0) {
        // 如果没有更多书籍，删除文件夹记录
        if (path !== '') {
          await db.prepare('DELETE FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, path)
            .run();
        }

        return utils.json({
          success: true,
          message: '文件夹删除完成',
          deleted_books: offset,
          complete: true
        });
      }

      // 收集所有书籍 ID
      const bookIds = books.results.map(book => book.id);

      // 批量删除书籍的章节内容
      const contentStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM chapter_contents WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').bind(bookId)
      );
      await db.batch(contentStatements);

      // 批量删除章节
      const chapterStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(bookId)
      );
      await db.batch(chapterStatements);

      // 批量删除书籍
      const bookStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM books WHERE id = ?').bind(bookId)
      );
      await db.batch(bookStatements);

      // 返回处理结果
      return utils.json({
        success: true,
        message: `已删除 ${bookIds.length} 本书籍`,
        deleted_books: bookIds.length,
        complete: false
      });
    } catch (error) {
      console.error('删除文件夹失败:', error);
      return utils.error('删除文件夹失败: ' + error.message, 500);
    }
  },

  async batchProcessBooks(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { action, bookIds, folder_path } = data;

      if (!action || !bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
        return utils.error('请求参数不完整', 400);
      }

      // 验证所有书籍都属于当前用户
      for (const bookId of bookIds) {
        const book = await db.prepare('SELECT user_id FROM books WHERE id = ?').bind(bookId).first();
        if (!book) {
          return utils.error(`书籍不存在: ${bookId}`, 404);
        }
        if (book.user_id !== userId) {
          return utils.error(`无权操作书籍: ${bookId}`, 403);
        }
      }

      // 根据action执行不同操作
      if (action === 'delete') {
        // 批量删除
        const statements = [];
        for (const bookId of bookIds) {
          statements.push(db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(bookId));
          statements.push(db.prepare('DELETE FROM books WHERE id = ?').bind(bookId));
        }

        await db.batch(statements);

        return utils.json({
          success: true,
          message: `已成功删除${bookIds.length}本书籍`
        });
      } else if (action === 'move') {
        // 批量移动到指定文件夹
        if (folder_path === undefined) {
          return utils.error('移动操作需要指定目标文件夹', 400);
        }

        const sanitizedFolder = utils.security.sanitizeInput(folder_path);
        const statements = [];

        for (const bookId of bookIds) {
          statements.push(
            db.prepare('UPDATE books SET folder_path = ? WHERE id = ?').bind(sanitizedFolder, bookId)
          );
        }

        await db.batch(statements);

        // 如果是移动到新文件夹，创建文件夹
        if (sanitizedFolder) {
          try {
            const existingFolder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
              .bind(userId, sanitizedFolder).first();

            if (!existingFolder) {
              const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
              await db.prepare('INSERT INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)')
                .bind(folderId, userId, sanitizedFolder, utils.now()).run();
            }
          } catch (error) {
            console.error('创建文件夹失败:', error);
            // 继续执行，不影响书籍移动
          }
        }

        return utils.json({
          success: true,
          message: `已成功移动${bookIds.length}本书籍到"${sanitizedFolder || '根目录'}"`
        });
      } else {
        return utils.error('不支持的操作类型', 400);
      }
    } catch (error) {
      console.error('批量处理书籍失败:', error);
      return utils.error('批量处理书籍失败: ' + error.message, 500);
    }
  },

  async getBookFolders(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;

      // 获取所有文件夹
      const folders = await db.prepare('SELECT path FROM folders WHERE user_id = ? ORDER BY path ASC').bind(userId).all();
      const result = [];

      // 获取每个文件夹中的书籍数量
      for (const folder of folders.results) {
        const count = await db.prepare(`
          SELECT COUNT(*) as count
          FROM books
          WHERE user_id = ? AND folder_path = ?
        `).bind(userId, folder.path).first();

        result.push({
          path: folder.path,
          count: count.count
        });
      }

      // 获取未分类书籍数量
      const uncategorizedCount = await db.prepare(`
        SELECT COUNT(*) as count
        FROM books
        WHERE user_id = ? AND (folder_path = '' OR folder_path IS NULL)
      `).bind(userId).first();

      return utils.json({
        folders: result,
        uncategorized: uncategorizedCount.count
      });
    } catch (error) {
      console.error('获取书籍文件夹列表失败:', error);
      return utils.error('获取书籍文件夹列表失败: ' + error.message, 500);
    }
  },

  async createFolder(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const path = data.path;

      if (!path) {
        return utils.error('文件夹路径不能为空', 400);
      }

      const sanitizedPath = utils.security.sanitizeInput(path);

      // 检查文件夹是否已存在
      const existingFolder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
        .bind(userId, sanitizedPath).first();

      if (existingFolder) {
        return utils.error('文件夹已存在', 409);
      }

      // 创建新文件夹
      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await db.prepare('INSERT INTO folders(id, user_id, path, created_at) VALUES(?, ?, ?, ?)')
        .bind(folderId, userId, sanitizedPath, utils.now()).run();

      return utils.json({
        success: true,
        message: '文件夹已创建',
        folder_id: folderId,
        path: sanitizedPath
      });
    } catch (error) {
      console.error('创建文件夹失败:', error);
      return utils.error('创建文件夹失败: ' + error.message, 500);
    }
  },

  async renameFolder(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const data = await request.json();
      const { path, newPath } = data;

      if (!path) {
        return utils.error('原文件夹路径不能为空', 400);
      }

      if (!newPath) {
        return utils.error('新文件夹路径不能为空', 400);
      }

      const sanitizedPath = utils.security.sanitizeInput(path);
      const sanitizedNewPath = utils.security.sanitizeInput(newPath);

      // 检查原文件夹是否存在
      const existingFolder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
        .bind(userId, sanitizedPath).first();

      if (!existingFolder) {
        return utils.error('原文件夹不存在', 404);
      }

      // 检查新文件夹名是否已存在
      const newFolderExists = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
        .bind(userId, sanitizedNewPath).first();

      if (newFolderExists) {
        return utils.error('新文件夹名已存在', 409);
      }

      const statements = [];

      // 更新文件夹路径
      statements.push(db.prepare('UPDATE folders SET path = ? WHERE user_id = ? AND path = ?')
        .bind(sanitizedNewPath, userId, sanitizedPath));

      // 更新书籍的文件夹路径
      statements.push(db.prepare('UPDATE books SET folder_path = ? WHERE user_id = ? AND folder_path = ?')
        .bind(sanitizedNewPath, userId, sanitizedPath));

      await db.batch(statements);

      return utils.json({
        success: true,
        message: '文件夹已重命名',
        oldPath: sanitizedPath,
        newPath: sanitizedNewPath
      });
    } catch (error) {
      console.error('重命名文件夹失败:', error);
      return utils.error('重命名文件夹失败: ' + error.message, 500);
    }
  },

  async deleteFolder(request, env, userId, params) {
    try {
      const db = env.CLOUD_READER_DB;

      // 尝试从请求体中获取path参数
      let path = '';
      try {
        const requestData = await request.json();
        path = requestData.path || '';
      } catch (e) {
        // 如果请求体解析失败，尝试从params中获取
        path = decodeURIComponent(params.path || '');
      }

      if (!path) {
        return utils.error('文件夹路径不能为空', 400);
      }

      const sanitizedPath = utils.security.sanitizeInput(path);

      // 验证文件夹存在性和所有权
      const folder = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND path = ?')
        .bind(userId, sanitizedPath).first();

      // 如果是空路径或强制删除，允许继续
      if (!folder && path !== '' && !params.force_delete) {
        return utils.error('文件夹不存在或无权访问', 404);
      }

      // 如果是直接删除空文件夹的请求
      if (params.empty_folder || params.force_delete) {
        if (path !== '') {
          await db.prepare('DELETE FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, path)
            .run();
        }

        return utils.json({
          success: true,
          message: '文件夹删除成功',
          deleted_books: 0,
          complete: true
        });
      }

      // 获取要删除的书籍数量
      const batch_size = params.batch_size || 20;
      const offset = params.offset || 0;

      // 获取文件夹中的书籍
      const books = await db.prepare('SELECT id FROM books WHERE user_id = ? AND folder_path = ? LIMIT ? OFFSET ?')
        .bind(userId, path, batch_size, offset)
        .all();

      // 如果没有书籍，直接删除文件夹
      if (!books.results || books.results.length === 0) {
        // 如果没有更多书籍，删除文件夹记录
        if (path !== '') {
          await db.prepare('DELETE FROM folders WHERE user_id = ? AND path = ?')
            .bind(userId, path)
            .run();
        }

        return utils.json({
          success: true,
          message: '文件夹删除完成',
          deleted_books: offset,
          complete: true
        });
      }

      // 收集所有书籍 ID
      const bookIds = books.results.map(book => book.id);

      // 批量删除书籍的章节内容
      const contentStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM chapter_contents WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)')
          .bind(bookId)
      );
      await db.batch(contentStatements);

      // 批量删除章节
      const chapterStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(bookId)
      );
      await db.batch(chapterStatements);

      // 批量删除书籍
      const bookStatements = bookIds.map(bookId =>
        db.prepare('DELETE FROM books WHERE id = ?').bind(bookId)
      );
      await db.batch(bookStatements);

      // 返回处理结果
      return utils.json({
        success: true,
        message: `已删除 ${bookIds.length} 本书籍`,
        deleted_books: bookIds.length,
        complete: false
      });
    } catch (error) {
      console.error('删除文件夹失败:', error);
      return utils.error('删除文件夹失败: ' + error.message, 500);
    }
  },

  async getSystemSettings(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;

      // 不检查身份,直接返回所有设置
      const settings = await db.prepare('SELECT key, value, updated_at FROM system_settings').all();

      return utils.json({
        success: true,
        settings: settings.results
      });
    } catch (error) {
      console.error('获取系统设置失败:', error);
      return utils.error('获取系统设置失败: ' + error.message);
    }
  },

  async updateSystemSettings(request, env, userId) {
    try {
      const db = env.CLOUD_READER_DB;

      // 获取请求数据
      const data = await request.json();
      if (!data || !data.key || typeof data.value === 'undefined') {
        return utils.error('缺少必要参数');
      }

      // 验证设置键
      const validKeys = ['allow_registration', 'demo_mode'];
      if (!validKeys.includes(data.key)) {
        return utils.error('无效的设置键');
      }

      // 更新系统设置
      await utils.security.updateSystemSetting(db, data.key, data.value, userId);

      return utils.json({
        success: true,
        message: '系统设置已更新'
      });
    } catch (error) {
      console.error('更新系统设置失败:', error);
      return utils.error('更新系统设置失败: ' + error.message);
    }
  }
};

// 管理员API处理函数
const adminHandlers = {
  // 获取用户列表
  async getUserList(request, env, adminId) {
    const db = env.CLOUD_READER_DB;
    // 检查是否管理员
    const admin = await db.prepare('SELECT is_admin FROM users WHERE id = ?').bind(adminId).first();
    if (!admin || !admin.is_admin) {
      return utils.error('无权访问', 403);
    }
    const users = await db.prepare('SELECT id, username, created_at, account_status, is_admin FROM users ORDER BY created_at DESC').all();
    return utils.json({ users: users.results });
  },

  // 获取用户列表
  async getUsers(request, env, adminId) {
    try {
      const db = env.CLOUD_READER_DB;
      const users = await db.prepare(
        `SELECT id, username, created_at, account_status, is_admin 
         FROM users ORDER BY created_at DESC`
      ).all();
      return utils.json({ users: users.results });
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return utils.error('获取用户列表失败', 500);
    }
  },

  // 更新用户状态
  async updateUserStatus(request, env, adminId, userId) {
    try {
      const db = env.CLOUD_READER_DB;
      const { status } = await request.json();

      if (!['active', 'disabled'].includes(status)) {
        return utils.error('无效的状态值');
      }

      if (userId === adminId) {
        return utils.error('不能修改自己的状态');
      }

      await db.prepare(
        'UPDATE users SET account_status = ? WHERE id = ?'
      ).bind(status, userId).run();

      return utils.json({ message: '用户状态已更新' });
    } catch (error) {
      console.error('更新用户状态失败:', error);
      return utils.error('更新用户状态失败', 500);
    }
  },

  // 删除用户
  async deleteUser(request, env, adminId, userId) {
    const db = env.CLOUD_READER_DB;

    // 不能删除自己
    if (userId === adminId) {
      return utils.error('不能删除自己的账号');
    }

    // 优化：简化删除用户数据的过程
    const statements = [];

    // 1. 删除章节内容和章节 - 直接通过user_id
    statements.push(db.prepare('DELETE FROM chapter_contents WHERE user_id = ?').bind(userId));
    statements.push(db.prepare('DELETE FROM chapters WHERE user_id = ?').bind(userId));

    // 2. 删除书籍
    statements.push(db.prepare('DELETE FROM books WHERE user_id = ?').bind(userId));

    // 3. 删除用户相关的其他数据
    statements.push(db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId));
    statements.push(db.prepare('DELETE FROM user_chapter_rules WHERE user_id = ?').bind(userId));
    statements.push(db.prepare('DELETE FROM tokens WHERE user_id = ?').bind(userId));
    statements.push(db.prepare('DELETE FROM folders WHERE user_id = ?').bind(userId));

    // 4. 最后删除用户
    statements.push(db.prepare('DELETE FROM users WHERE id = ?').bind(userId));

    // 批量执行所有删除操作
    await db.batch(statements);

    return utils.json({ message: '用户已删除' });
  },

  // 获取系统设置
  async getSettings(request, env, adminId) {
    const db = env.CLOUD_READER_DB;
    const settings = await db.prepare(
      'SELECT key, value FROM system_settings'
    ).all();
    return utils.json({
      settings: Object.fromEntries(
        settings.results.map(s => [s.key, s.value])
      )
    });
  },

  // 更新系统设置
  async updateSettings(request, env, adminId) {
    const db = env.CLOUD_READER_DB;
    const updates = await request.json();

    // 验证设置值
    const allowedKeys = [
      'allow_registration',
      'demo_mode'
    ];

    const statements = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;

      statements.push(
        db.prepare(
          'UPDATE system_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?'
        ).bind(String(value), utils.now(), adminId, key)
      );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return utils.json({ message: '设置已更新' });
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  utils.log(`收到请求: ${method} ${path}`);

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
    
    // 创建Turso数据库连接
    const db = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });

    // 在演示模式下，定期清理非管理员用户账户
    const isDemoMode = await utils.security.isDemoMode(db);
    if (isDemoMode) {
      await utils.security.cleanupDemoAccounts(db);
    }
  } catch (error) {
    utils.log('数据库初始化失败', error);
    return utils.error('数据库初始化失败: ' + error.message, 500);
  }

  const route = utils.parseRoute(path);
  utils.log('路由解析结果', route);

  const isPublicRoute = (route.type === 'auth' && ['login', 'register'].includes(route.action)) ||
    (route.type === 'system' && route.action === 'settings' && method === 'GET') ||
    (route.type === 'videoproxy' && route.action === 'get' && method === 'GET');

  if (!isPublicRoute) {
    const authHeader = request.headers.get('Authorization');
    const token = utils.parseAuthHeader(authHeader);

    if (!token) {
      return utils.error('未授权: 缺少令牌', 401);
    }

    try {
      const db = createClient({
        url: env.TURSO_DB_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      });
      
      const tokenResult = await db.execute(
        'SELECT user_id, expiration FROM tokens WHERE token = ?',
        [token]
      );

      if (tokenResult.rows.length === 0) {
        return utils.error('未授权: 无效令牌', 401);
      }

      const tokenInfo = tokenResult.rows[0];

      if (Date.now() > tokenInfo.expiration) {
        await db.execute('DELETE FROM tokens WHERE token = ?', [token]);
        return utils.error('未授权: 令牌已过期', 401);
      }

      await db.execute(
        'UPDATE tokens SET last_used_at = ? WHERE token = ?',
        [utils.now(), token]
      );

      return await handleAuthenticatedRequest(request, env, route, method, tokenInfo.user_id, token);
    } catch (error) {
      utils.log('令牌验证失败', error);
      return utils.error('令牌验证失败: ' + error.message, 500);
    }
  } else {
    return await handlePublicRequest(request, env, route, method);
  }
}

async function handlePublicRequest(request, env, route, method) {
  utils.log('处理公共请求', { route, method });

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

  if (route.type === 'videoproxy' && route.action === 'get' && method === 'GET') {
    return await handlers.getVideoProxy(request, env);
  }

  return utils.error('资源不存在或方法不允许', 404);
}

async function handleAuthenticatedRequest(request, env, route, method, userId, token) {
  const db = env.CLOUD_READER_DB;
  utils.log('处理认证请求', { route, method, userId });
  try {

    if (route.type === 'admin') {
      // 检查管理员权限
      const isAdmin = await utils.isAdmin(db, userId);
      if (!isAdmin) {
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

    if (route.type === 'auth') {
      if (route.action === 'logout' && method === 'POST') {
        return await handlers.logout(request, env, userId, {}, token);
      }
      if (route.action === 'delete-account' && method === 'POST') {
        return await handlers.deleteAccount(request, env, userId);
      }
    }

    if (route.type === 'user') {
      if (route.action === 'settings') {
        if (method === 'GET') {
          return await handlers.getUserSettings(request, env, userId);
        }
        if (method === 'PUT') {
          return await handlers.saveUserSettings(request, env, userId);
        }
      }

      if (route.action === 'chapter-rules') {
        if (method === 'GET') {
          return await handlers.getChapterRules(request, env, userId);
        }
        if (method === 'PUT') {
          return await handlers.saveChapterRules(request, env, userId);
        }
      }
    }

    if (route.type === 'folders') {
      if (route.action === 'list') {
        return await handlers.getBookFolders(request, env, userId);
      }
      if (route.action === 'create' && method === 'POST') {
        return await handlers.createFolder(request, env, userId);
      }
      if (route.action === 'rename' && method === 'PUT') {
        return await handlers.renameFolder(request, env, userId);
      }
      if (route.action === 'delete' && method === 'POST') {
        return await handlers.deleteFolder(request, env, userId, route);
      }
    }

    if (route.type === 'books') {
      if (route.action === 'list' && method === 'GET') {
        return await handlers.getBooks(request, env, userId);
      }

      if (route.action === 'folders' && method === 'GET') {
        return await handlers.getBookFolders(request, env, userId);
      }

      if (route.action === 'create' && method === 'POST') {
        return await handlers.createBook(request, env, userId);
      }

      // 批量处理书籍
      if (route.action === 'batch' && method === 'POST') {
        return await handlers.batchProcessBooks(request, env, userId);
      }

      if (route.action === 'info' && method === 'GET') {
        return await handlers.getBookInfo(request, env, userId, { bookId: route.bookId });
      }

      if (route.action === 'get' && method === 'GET') {
        return await handlers.getBookInfo(request, env, userId, { bookId: route.bookId });
      }

      if (route.action === 'update' && method === 'PUT') {
        return await handlers.updateBookInfo(request, env, userId, { bookId: route.bookId });
      }

      if (route.action === 'progress' && method === 'PUT') {
        return await handlers.updateBookProgress(request, env, userId, { bookId: route.bookId });
      }

      // 服务器端处理章节内容上传
      if (route.action === 'upload-content' && method === 'POST') {
        return await handlers.uploadBookContent(request, env, userId, { bookId: route.bookId });
      }

      if (route.action === 'chapter' && method === 'GET') {
        return await handlers.getChapter(request, env, userId, { bookId: route.bookId, chapterIndex: route.chapterIndex });
      }

      if (route.action === 'get' && method === 'DELETE') {
        return await handlers.deleteBook(request, env, userId, { bookId: route.bookId });
      }
    }

    if (route.type === 'system') {
      if (route.action === 'settings' && method === 'GET') {
        return await handlers.getSystemSettings(request, env, userId);
      }
      if (route.action === 'settings' && method === 'PUT') {
        return await handlers.updateSystemSettings(request, env, userId);
      }
    }

    return utils.error('找不到请求的资源或方法不允许', 404);
  } catch (error) {
    utils.log('处理请求时出错', error);
    return utils.error('处理请求失败: ' + error.message, 500);
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      utils.log('处理请求时出错', error);
      return utils.error('服务器内部错误: ' + error.message, 500);
    }
  }
};