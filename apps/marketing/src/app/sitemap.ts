import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://padelaso.com/privacidad", changeFrequency: "monthly", priority: 0.3 },
    { url: "https://padelaso.com/asistentes/chatgpt", changeFrequency: "monthly", priority: 0.5 },
    {
      url: "https://padelaso.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
