var SITE = {
  name: 'Grid Saver',
  color: '#d62976',
  unit: 'posts',
  scrolling: 'Scrolling the profile...',
  postTitle: 'Post by',
  wrongPage: 'Open an Instagram profile or a single post first, then click the Grid Saver icon again.',
  notFoundPost: "Couldn't read this post. Refresh the page and try again.",
  notFoundProfile: "No posts found. If the account is private, you need to follow it. Otherwise refresh the page and try again.",
  linkSelector: 'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
  linkCode(href) {
    const m = href.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,})/);
    return m ? m[1] : null;
  },
  postUrl(p) {
    return `https://www.instagram.com/p/${p.code}/`;
  },
  page(loc) {
    const code = this.linkCode(loc.pathname);
    if (code) return { type: 'post', code };
    const RESERVED = new Set(['explore', 'reels', 'stories', 'direct', 'accounts', 'about', 'legal', 'developer',
      'emails', 'challenge', 'web', 'api', 'graphql', 'p', 'reel', 'tv', 'privacy', 'session', 'oauth', 'your_activity', 'notifications']);
    const parts = loc.pathname.split('/').filter(Boolean);
    if (!parts.length || RESERVED.has(parts[0])) return null;
    if (!/^[A-Za-z0-9._]{1,30}$/.test(parts[0])) return null;
    return { type: 'profile', user: parts[0] };
  }
};
