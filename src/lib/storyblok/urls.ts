export const signInUrl = "/api/connect/storyblok";

export const storyEditorUrl = (spaceId: number, storyId: number) =>
  `https://app.storyblok.com/#/me/spaces/${spaceId}/stories/0/0/${storyId}`;

// Storyblok serves avatars through its image service, sized in the path.
export const avatarUrl = (avatar: string, size = 48) =>
  /^https?:\/\//.test(avatar) ? avatar : `https://img2.storyblok.com/${size}x${size}/${avatar.replace(/^\//, "")}`;
