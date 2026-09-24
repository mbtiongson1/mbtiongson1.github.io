function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function field(item, ...names) {
  for (const name of names) {
    const value = item?.[name];
    if (text(value)) return text(value);
  }
  return "";
}

export function extractYouTubeId(urlOrId) {
  const str = text(urlOrId);
  if (!str) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : str;
}

export function isServiceMedia(item) {
  if (!item || typeof item !== "object") return false;
  const kind = field(item, "kind", "Kind").toLowerCase();
  if (kind === "recap" || field(item, "is_recap", "isRecap") === "true" || item.is_recap === true) return false;
  if (kind === "taglish") return false;
  return kind === "livestream" || kind === "sermon" || kind === "service" || Boolean(field(item, "service_time", "serviceTime", "ServiceTime"));
}

/**
 * Group service media items into distinct sermon objects.
 * Media rows sharing the same video ID or same (title, speaker) belong to the same sermon.
 */
export function groupSermonMedia(media, defaultServiceTimes = []) {
  const items = (Array.isArray(media) ? media : []).filter(isServiceMedia);
  const groups = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rawVideoId = field(item, "video_id", "videoId", "VideoId");
    const videoId = extractYouTubeId(rawVideoId);
    const title = field(item, "sermon_title", "sermonTitle", "SermonTitle");
    const speaker = field(item, "speaker", "Speaker");
    const serviceTime = field(item, "service_time", "serviceTime", "ServiceTime", "service_name", "serviceName", "ServiceName");

    // Try finding existing group with matching video_id (if present) or matching title+speaker
    let group = null;
    if (videoId) {
      group = groups.find((g) => g.video_id === videoId);
    }
    if (!group && (title || speaker)) {
      group = groups.find((g) => g.title.toLowerCase() === title.toLowerCase() && g.speaker.toLowerCase() === speaker.toLowerCase());
    }

    if (!group) {
      group = {
        title: title || "",
        speaker: speaker || "",
        video_id: videoId || "",
        service_times: [],
      };
      groups.push(group);
    }

    if (serviceTime && !group.service_times.includes(serviceTime)) {
      group.service_times.push(serviceTime);
    }
  }

  // If no service media was grouped, but default service times exist, create initial sermon groups per service time
  if (groups.length === 0) {
    const times = Array.isArray(defaultServiceTimes) ? defaultServiceTimes.filter(Boolean) : [];
    if (times.length > 0) {
      for (const t of times) {
        groups.push({
          title: "",
          speaker: "",
          video_id: "",
          service_times: [t],
        });
      }
    } else {
      groups.push({
        title: "",
        speaker: "",
        video_id: "",
        service_times: ["10:00 AM"],
      });
    }
  }

  return groups;
}

/**
 * Reconstruct the full media array from edited sermon groups and original non-service media.
 */
export function sermonsToMedia(sermonGroups, originalMedia = []) {
  const nonServiceMedia = (Array.isArray(originalMedia) ? originalMedia : []).filter((m) => !isServiceMedia(m)).map((m) => {
    const kind = field(m, "kind", "Kind") || "recap";
    const videoId = field(m, "video_id", "videoId", "VideoId");
    const thumb = field(m, "thumbnail_url", "thumbnailUrl", "ThumbnailUrl", "thumbnail", "Thumbnail");
    const url = field(m, "url", "Url", "watch_url", "watchUrl", "WatchUrl");
    const caption = field(m, "caption", "Caption");
    const sectionKey = field(m, "section_key", "sectionKey", "SectionKey") || "media";
    const guid = field(m, "binary_file_guid", "binaryFileGuid", "BinaryFileGuid") || null;
    return {
      ...m,
      section_key: sectionKey,
      kind,
      video_id: videoId || null,
      thumbnail_url: thumb || (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : ""),
      url: url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""),
      caption,
      binary_file_guid: guid,
    };
  });
  const serviceMedia = [];

  const groups = Array.isArray(sermonGroups) ? sermonGroups : [];
  for (let gIndex = 0; gIndex < groups.length; gIndex++) {
    const g = groups[gIndex] || {};
    const title = text(g.title);
    const speaker = text(g.speaker);
    const videoId = extractYouTubeId(g.video_id);
    const times = Array.isArray(g.service_times) ? g.service_times.map(text).filter(Boolean) : [];

    // If no service times are specified, create at least one row if there is content
    const serviceTimesToCreate = times.length > 0 ? times : (title || speaker || videoId ? ["Sunday Service"] : []);

    for (const time of serviceTimesToCreate) {
      const caption = [title, speaker].filter(Boolean).join(" // ") || `${time} Sunday Service`;
      serviceMedia.push({
        section_key: "media",
        kind: "livestream",
        service_name: time,
        service_time: time,
        sermon_title: title,
        speaker,
        video_id: videoId || null,
        caption,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        watch_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        thumbnail_url: videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : "",
        binary_file_guid: null,
      });
    }
  }

  return [...serviceMedia, ...nonServiceMedia];
}
