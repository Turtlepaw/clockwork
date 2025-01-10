import React from "react";
import { DocsThemeConfig } from "nextra-theme-docs";
import { useConfig } from "nextra-theme-docs";
import Image from "next/image";

const config: DocsThemeConfig = {
  logo: (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Image
        src="/clockwork_icon.png"
        width={25}
        height={25}
        alt="Logo"
        style={{ marginRight: 10 }}
      />
      <span>Clockwork</span>
    </div>
  ),
  head: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    let { title } = useConfig();
    if (title) {
      title += " | Clockwork";
    } else title = "Clockwork";
    return (
      <>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <link rel="icon" href="/clockwork_icon.png" sizes="any" />
      </>
    );
  },
  sidebar: {
    toggleButton: true,
    defaultMenuCollapseLevel: 1,
    autoCollapse: true,
  },
  docsRepositoryBase: "https://github.com/Turtlepaw/clockwork/tree/main/docs",
  project: {
    link: "https://github.com/Turtlepaw/clockwork",
  },
  toc: {
    backToTop: true,
  },
  backgroundColor: {
    dark: "#030b0f",
  },
  nextThemes: {
    defaultTheme: "system",
  },
  color: {
    hue: 197.65,
    saturation: 66.93,
    //lightness: 50,
  },
  footer: {
    content: `Built by Turtlepaw. Icons by Material Symbols`,
  },
};

export default config;
