export type MediaKind = 'image' | 'video';
export type SourceRoot = { id:string; path:string; displayName:string; lastScannedAt?:string; createdAt:string };
export type MediaItem = {
  id:string; rootId:string; path:string; relativePath:string; filename:string; extension:string;
  kind:MediaKind; size:number; modifiedAt:string; createdAt:string;
  width?:number; height?:number; takenAt?:string; favorite:boolean; online:boolean;
  thumbnailPath?:string; folderName:string;
};
export type ManyouState = { roots:SourceRoot[]; items:MediaItem[] };
