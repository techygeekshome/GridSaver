// Turns an Instagram media object (either of the shapes Instagram's web app uses)
// into { id, code, owner, date, caption, media: [{ kind, urls, w, h, video }] }.
function extract(n) {
  // Current shape: { code, pk, image_versions2, video_versions, carousel_media, user, taken_at }
  if (typeof n.code === 'string' && (n.image_versions2 || n.carousel_media)) {
    const parts = Array.isArray(n.carousel_media) && n.carousel_media.length ? n.carousel_media : [n];
    const media = [];
    for (const m of parts) {
      const imgs = ((m.image_versions2 && m.image_versions2.candidates) || []).filter((c) => c && c.url);
      imgs.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
      const vids = (m.video_versions || []).filter((v) => v && v.url);
      vids.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
      if (!imgs.length && !vids.length) continue;
      media.push({
        kind: vids.length ? 'video' : 'image',
        urls: imgs.slice(0, 3).map((c) => c.url),
        w: (imgs[0] && imgs[0].width) || 0,
        h: (imgs[0] && imgs[0].height) || 0,
        video: [...new Set(vids.map((v) => v.url))]
      });
    }
    return {
      id: String(n.pk || n.id || n.code),
      code: n.code,
      owner: (n.user && n.user.username) || (n.owner && n.owner.username) || '',
      date: Number(n.taken_at) || 0,
      caption: (n.caption && n.caption.text) || '',
      media
    };
  }
  // Older shape: { shortcode, display_url, display_resources, video_url, edge_sidecar_to_children }
  if (typeof n.shortcode === 'string' && (n.display_url || n.display_resources)) {
    const kids = n.edge_sidecar_to_children && n.edge_sidecar_to_children.edges;
    const parts = kids && kids.length ? kids.map((e) => e.node) : [n];
    const media = [];
    for (const m of parts) {
      const res = (m.display_resources || []).slice().sort((a, b) => b.config_width * b.config_height - a.config_width * a.config_height);
      const url = (res[0] && res[0].src) || m.display_url;
      if (!url && !m.video_url) continue;
      media.push({
        kind: m.video_url ? 'video' : 'image',
        urls: url ? [url] : [],
        w: (res[0] && res[0].config_width) || (m.dimensions && m.dimensions.width) || 0,
        h: (res[0] && res[0].config_height) || (m.dimensions && m.dimensions.height) || 0,
        video: m.video_url ? [m.video_url] : []
      });
    }
    const cap = n.edge_media_to_caption && n.edge_media_to_caption.edges && n.edge_media_to_caption.edges[0];
    return {
      id: String(n.id || n.shortcode),
      code: n.shortcode,
      owner: (n.owner && n.owner.username) || '',
      date: Number(n.taken_at_timestamp) || 0,
      caption: (cap && cap.node && cap.node.text) || '',
      media
    };
  }
  return null;
}
