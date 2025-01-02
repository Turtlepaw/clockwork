import React from "react";
import { DocsThemeConfig } from "nextra-theme-docs";
import { useConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: <span>Clockwork</span>,
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
        <link rel="icon" href="/images/favicon.ico" sizes="any" />
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
};

export default config;
