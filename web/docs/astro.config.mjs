import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://omnia.omniasimulation.com",
  base: "/docs",
  outDir: "./dist/docs",
  integrations: [
    mermaid(),
    starlight({
      title: "Omnia Docs",
      favicon: "/favicon.png",
      logo: {
        src: "./src/assets/img/logo.png",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/sortedcord/omnia-consolidated",
        },
      ],
      sidebar: [
        {
          label: "Introduction",
          slug: "index",
        },
        {
          label: "Architecture",
          items: [{ autogenerate: { directory: "architecture" } }],
        },
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Diary",
          items: [{ autogenerate: { directory: "diary" } }],
        },
      ],
      editLink: {
        baseUrl: "https://github.com/sortedcord/omnia/edit/main/web/docs/",
      },
    }),
  ],
});
