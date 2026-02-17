
import { get, set } from 'idb-keyval';
import { API_BASE_URL, CACHE_KEY_METADATA, CACHE_KEY_COVERS, CACHE_KEY_LYRICS, CACHE_KEY_ANIMATED_COVERS, DEFAULT_COVER, SAMPLE_TRACKS } from '../constants';
import { Track } from '../types';

const CACHE_KEY_VIDEO_REGISTRY = "apple_clone_video_registry_v1";
const CACHE_KEY_ALBUM_ORDERS = "apple_clone_album_orders_v1";
const CACHE_KEY_CUSTOM_METADATA = "apple_clone_custom_metadata_v1";
const CACHE_KEY_CUSTOM_COVERS = "apple_clone_custom_covers_v1";

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.opus'];

const DEFAULT_VIDEO_LINKS: Record<string, string> = {
  "Where This Flower Blooms (feat. Frank Ocean).mp3": "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 
        ...options.headers
      }
    });
    return response;
  } catch (e) {
    throw e;
  }
};

export const uploadTrack = async (file: File): Promise<boolean> => {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      body: formData
    });
    return response.ok;
  } catch (error) {
    console.error("Upload failed:", error);
    return false;
  }
};

export const deleteTracks = async (filenames: string[]): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/delete-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames })
    });
    
    // Also remove from IDB cache to ensure they don't reappear on offline reload
    const cached = await get(CACHE_KEY_METADATA) as Track[] || [];
    const filtered = cached.filter(t => !filenames.includes(t.filename));
    await set(CACHE_KEY_METADATA, filtered);
    
    return response.ok;
  } catch (error) {
    console.error("Batch delete failed:", error);
    return false;
  }
};

export const uploadTrackWithProgress = (
  file: File,
  onProgress: (percent: number) => void,
  metadata?: { album?: string; type: 'single' | 'album' }
): Promise<boolean> => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    if (metadata) {
      formData.append("album_name", metadata.album || "");
      formData.append("is_single", metadata.type === 'single' ? 'true' : 'false');
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(true);
      } else {
        console.error("Upload failed", xhr.responseText);
        resolve(false);
      }
    });

    xhr.addEventListener("error", () => {
        console.error("Upload network error");
        resolve(false);
    });
    
    xhr.open("POST", `${API_BASE_URL}/upload`);
    xhr.send(formData);
  });
};

export const resolveYoutubeProxy = async (url: string, metadata?: { album?: string, type: 'single' | 'album' }): Promise<Track | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });

    if (!response.ok) throw new Error("Server download initiation failed");
    
    const initialData = await response.json();
    const taskId = initialData.task;

    if (taskId === undefined) throw new Error("No task ID returned from server");

    let isDone = false;
    while (!isDone) {
        const statusRes = await fetch(`${API_BASE_URL}/api/download-status/${taskId}`);
        if (!statusRes.ok) throw new Error("Status polling failed");
        
        const statusData = await statusRes.json();
        if (statusData.status === 'done') {
            isDone = true;
        } else if (statusData.status === 'error') {
            throw new Error("Server reported download error");
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    return {
      id: "download-complete",
      filename: "refresh-required",
      title: "Download Complete",
      artist: "System",
      album: "Downloads",
      url: "",
      source: 'remote'
    };
  } catch (e) {
    console.error("YouTube Download Failed:", e);
    return null;
  }
};

export const saveImportedTrack = async (track: Track): Promise<Track[]> => {
  if (track.filename === "refresh-required") return await fetchAllTracks();
  const cached = (await get(CACHE_KEY_METADATA)) as Track[] || [];
  const index = cached.findIndex(t => t.id === track.id);
  if (index !== -1) {
    cached[index] = track;
  } else {
    cached.unshift(track);
  }
  await set(CACHE_KEY_METADATA, cached);
  return cached;
};

export const getVideoRegistry = async (): Promise<Record<string, string>> => {
  try {
    const response = await apiFetch(`/music/video_registry.json?t=${Date.now()}`);
    if (response.ok) {
      const serverRegistry = await response.json();
      await set(CACHE_KEY_VIDEO_REGISTRY, serverRegistry);
      return serverRegistry;
    }
  } catch (e) {}
  const cached = await get(CACHE_KEY_VIDEO_REGISTRY);
  return (cached as Record<string, string>) || DEFAULT_VIDEO_LINKS;
};

export const getCustomCoversRegistry = async (): Promise<Record<string, string>> => {
  try {
    const response = await apiFetch(`/music/custom_covers.json?t=${Date.now()}`);
    if (response.ok) {
      const registry = await response.json();
      await set(CACHE_KEY_CUSTOM_COVERS, registry);
      return registry;
    }
  } catch (e) {}
  return (await get(CACHE_KEY_CUSTOM_COVERS)) || {};
};

export const saveCustomCoverMapping = async (key: string, imageFilename: string): Promise<boolean> => {
  try {
    const registry = await getCustomCoversRegistry();
    if (imageFilename) {
      registry[key] = imageFilename;
    } else {
      delete registry[key];
    }
    await set(CACHE_KEY_CUSTOM_COVERS, registry);
    const jsonContent = JSON.stringify(registry, null, 2);
    const file = new File([jsonContent], "custom_covers.json", { type: "application/json" });
    return await uploadTrack(file);
  } catch (e) {
    console.error("Failed to save custom covers registry", e);
    return false;
  }
};

export const getCustomMetadataRegistry = async (): Promise<Record<string, { title?: string, artist?: string, album?: string }>> => {
  try {
    const response = await apiFetch(`/music/custom_metadata.json?t=${Date.now()}`);
    if (response.ok) {
      const registry = await response.json();
      await set(CACHE_KEY_CUSTOM_METADATA, registry);
      return registry;
    }
  } catch (e) {}
  return (await get(CACHE_KEY_CUSTOM_METADATA)) || {};
};

export const saveTrackMetadata = async (trackId: string, metadata: { title: string, artist: string, album: string }): Promise<Track[]> => {
  try {
    const registry = await getCustomMetadataRegistry();
    registry[trackId] = metadata;
    await set(CACHE_KEY_CUSTOM_METADATA, registry);
    const jsonContent = JSON.stringify(registry, null, 2);
    const file = new File([jsonContent], "custom_metadata.json", { type: "application/json" });
    await uploadTrack(file);
  } catch (e) {
    console.error("Failed to save custom metadata registry to server", e);
  }
  return await fetchAllTracks();
};

export const saveBatchTrackMetadata = async (trackIds: string[], metadata: { title?: string, artist?: string, album?: string }): Promise<Track[]> => {
  try {
    const registry = await getCustomMetadataRegistry();
    trackIds.forEach(id => {
      const existing = registry[id] || {};
      registry[id] = {
        title: metadata.title || existing.title,
        artist: metadata.artist || existing.artist,
        album: metadata.album || existing.album
      };
    });
    await set(CACHE_KEY_CUSTOM_METADATA, registry);
    const jsonContent = JSON.stringify(registry, null, 2);
    const file = new File([jsonContent], "custom_metadata.json", { type: "application/json" });
    await uploadTrack(file);
  } catch (e) {
    console.error("Failed to save batch metadata registry to server", e);
  }
  return await fetchAllTracks();
};

export const getAnimatedCoversRegistry = async (): Promise<Record<string, string>> => {
  try {
    const response = await apiFetch(`/music/animated_covers.json?t=${Date.now()}`);
    if (response.ok) {
      const registry = await response.json();
      await set(CACHE_KEY_ANIMATED_COVERS, registry);
      return registry;
    }
  } catch (e) {}
  return (await get(CACHE_KEY_ANIMATED_COVERS)) || {};
};

export const saveAnimatedCoverMapping = async (key: string, gifFilename: string): Promise<boolean> => {
  try {
    const registry = await getAnimatedCoversRegistry();
    if (gifFilename) {
      registry[key] = gifFilename;
    } else {
      delete registry[key];
    }
    await set(CACHE_KEY_ANIMATED_COVERS, registry);
    const jsonContent = JSON.stringify(registry, null, 2);
    const file = new File([jsonContent], "animated_covers.json", { type: "application/json" });
    return await uploadTrack(file);
  } catch (e) {
    console.error("Failed to save animated covers registry", e);
    return false;
  }
};

export const saveTrackVideoUrl = async (trackId: string, videoUrl: string): Promise<Track[]> => {
  try {
    const registry = await getVideoRegistry();
    if (videoUrl) {
      registry[trackId] = videoUrl;
    } else {
      delete registry[trackId];
    }
    await set(CACHE_KEY_VIDEO_REGISTRY, registry);
    const jsonContent = JSON.stringify(registry, null, 2);
    const file = new File([jsonContent], "video_registry.json", { type: "application/json" });
    await uploadTrack(file);
  } catch (e) {
    console.error("Failed to save video registry to server", e);
  }
  return await fetchAllTracks();
};

export const getLyricsRegistry = async (): Promise<Record<string, string>> => {
    try {
        const response = await apiFetch(`/music/lyrics_registry.json?t=${Date.now()}`);
        if (response.ok) {
            const registry = await response.json();
            await set(CACHE_KEY_LYRICS, registry);
            return registry;
        }
    } catch (e) {}
    return (await get(CACHE_KEY_LYRICS)) || {};
};

export const saveTrackLyrics = async (trackId: string, lyrics: string): Promise<Track[]> => {
    try {
        const registry = await getLyricsRegistry();
        registry[trackId] = lyrics;
        await set(CACHE_KEY_LYRICS, registry);
        const jsonContent = JSON.stringify(registry, null, 2);
        const file = new File([jsonContent], "lyrics_registry.json", { type: "application/json" });
        await uploadTrack(file);
    } catch (e) {
        console.error("Failed to save lyrics registry to server", e);
    }
    return await fetchAllTracks();
};

export const getAlbumOrders = async (): Promise<Record<string, string[]>> => {
    try {
        const response = await apiFetch(`/music/album_orders.json?t=${Date.now()}`);
        if (response.ok) {
            const orders = await response.json();
            await set(CACHE_KEY_ALBUM_ORDERS, orders);
            return orders;
        }
    } catch (e) {}
    return (await get(CACHE_KEY_ALBUM_ORDERS)) || {};
};

export const saveAlbumOrder = async (albumName: string, trackIds: string[]): Promise<boolean> => {
    try {
        const orders = await getAlbumOrders();
        orders[albumName] = trackIds;
        await set(CACHE_KEY_ALBUM_ORDERS, orders);
        const jsonContent = JSON.stringify(orders, null, 2);
        const file = new File([jsonContent], "album_orders.json", { type: "application/json" });
        return await uploadTrack(file);
    } catch (e) {
        console.error("Failed to save album order to server", e);
        return false;
    }
};

const getCoverStore = async (): Promise<Record<string, string>> => {
  return (await get(CACHE_KEY_COVERS)) || {};
};

const saveToCoverStore = async (artist: string, album: string, base64: string) => {
  const key = `${artist.toLowerCase()}|${album.toLowerCase()}`;
  const store = await getCoverStore();
  if (store[key]) return; 
  store[key] = base64;
  await set(CACHE_KEY_COVERS, store);
};

export const fetchAllTracks = async (): Promise<Track[]> => {
  try {
    let serverTracks: Track[] = [];
    try {
      const response = await apiFetch('/api/all-metadata');
      if (response.ok) {
        const serverItems: any[] = await response.json();
        const videoRegistry = await getVideoRegistry();
        const coverStore = await getCoverStore();
        const lyricsRegistry = await getLyricsRegistry();
        const animatedRegistry = await getAnimatedCoversRegistry();
        const customMetadataRegistry = await getCustomMetadataRegistry();
        const customCoversRegistry = await getCustomCoversRegistry();
        
        serverTracks = serverItems
          .filter(item => {
              const lower = item.filename.toLowerCase();
              return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
          }) 
          .map(item => {
            const filename = item.filename;
            const videoUrl = videoRegistry[filename];
            const lyrics = lyricsRegistry[filename];
            const custom = customMetadataRegistry[filename] || {};
            
            const artist = custom.artist || item.artist || "Unknown Artist";
            const album = custom.album || item.album || "Unknown Album";
            const title = custom.title || item.title || filename;
            
            const trackKey = `track:${filename}`;
            const albumKey = `album:${artist}|${album}`;
            
            // Resolve Cover (Custom Registry > Animated > IDB Store > Default)
            const customCoverFile = customCoversRegistry[trackKey] || customCoversRegistry[albumKey];
            const customCoverUrl = customCoverFile ? `${API_BASE_URL}/music/${encodeURIComponent(customCoverFile)}` : undefined;

            const animatedFile = animatedRegistry[trackKey] || animatedRegistry[albumKey];
            const animatedUrl = animatedFile ? `${API_BASE_URL}/music/${encodeURIComponent(animatedFile)}` : undefined;

            const coverKey = `${artist.toLowerCase()}|${album.toLowerCase()}`;
            const resolvedCover = customCoverUrl || coverStore[coverKey] || DEFAULT_COVER;

            return {
              id: filename,
              filename: filename,
              url: `${API_BASE_URL}/music/${encodeURIComponent(filename)}`,
              title: title,
              artist: artist,
              album: album,
              duration: item.duration,
              coverUrl: resolvedCover,
              animatedCoverUrl: animatedUrl,
              videoUrl: videoUrl,
              lyrics: lyrics,
              source: 'remote' as const
            };
          });
      }
    } catch (e) {
      console.warn("Server unreachable, utilizing cache only.");
    }

    const cachedMetadata = (await get(CACHE_KEY_METADATA)) as Track[] || [];
    const mergedMap = new Map<string, Track>();
    
    cachedMetadata.forEach(t => mergedMap.set(t.id, t));
    serverTracks.forEach(t => mergedMap.set(t.id, t));

    const finalTracks = Array.from(mergedMap.values());
    await set(CACHE_KEY_METADATA, finalTracks);
    
    return finalTracks.length > 0 ? finalTracks : SAMPLE_TRACKS;
  } catch (error) {
    const cached = await get(CACHE_KEY_METADATA);
    return (Array.isArray(cached) && cached.length > 0) ? cached : SAMPLE_TRACKS;
  }
};

export const extractMetadataFromTrack = async (track: Track): Promise<Track> => {
  if (track.url.includes('soundhelix.com')) return track;
  
  try {
    const response = await apiFetch(`/api/metadata/${encodeURIComponent(track.filename)}`);
    if (response.ok) {
      const data = await response.json();
      const customRegistry = await getCustomMetadataRegistry();
      const customCovers = await getCustomCoversRegistry();
      const custom = customRegistry[track.filename] || {};
      
      const artist = custom.artist || data.artist || track.artist;
      const album = custom.album || data.album || track.album;
      const title = custom.title || data.title || track.title;
      
      const albumKey = `album:${artist}|${album}`;
      const trackKey = `track:${track.filename}`;
      const customCoverFile = customCovers[trackKey] || customCovers[albumKey];
      
      let coverUrl = track.coverUrl;
      
      if (customCoverFile) {
          coverUrl = `${API_BASE_URL}/music/${encodeURIComponent(customCoverFile)}`;
      } else if (data.cover) {
          coverUrl = data.cover.startsWith('data:') ? data.cover : `data:image/jpeg;base64,${data.cover}`;
          await saveToCoverStore(artist, album, coverUrl);
      }

      const updatedTrack: Track = {
        ...track,
        title: title,
        artist: artist,
        album: album,
        duration: data.duration || track.duration,
        coverUrl: coverUrl
      };

      const cachedTracks = (await get(CACHE_KEY_METADATA)) as Track[] || [];
      const index = cachedTracks.findIndex(t => t.filename === track.filename);
      if (index !== -1) cachedTracks[index] = updatedTrack;
      else cachedTracks.push(updatedTrack);
      await set(CACHE_KEY_METADATA, cachedTracks);

      return updatedTrack;
    }
  } catch (e) {
    console.error(`Metadata fetch failed for ${track.filename}`, e);
  }
  return track;
};
