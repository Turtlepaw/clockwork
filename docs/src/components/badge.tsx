/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";

export function LatestRelease() {
  const [release, setRelease] = useState<any | null>(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLatestRelease = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/turtlepaw/clockwork/releases/latest"
        );
        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        setRelease(data);
      } catch (err: any) {
        setError(err.message);
      }
    };

    fetchLatestRelease();
  }, []);

  if (error) {
    return <div>Error fetching release: {error}</div>;
  }

  //@ts-expect-error intl probably doesn't need to know all formats
  const units: Record<Intl.RelativeTimeFormatUnit, number> = {
    year: 24 * 60 * 60 * 1000 * 365,
    month: (24 * 60 * 60 * 1000 * 365) / 12,
    day: 24 * 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    minute: 60 * 1000,
    second: 1000,
  };

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  function getRelativeTime(d1: Date, d2 = new Date()) {
    const elapsed = d1.getTime() - d2.getTime();

    // "Math.abs" accounts for both "past" & "future" scenarios
    for (const [u, v] of Object.entries(units))
      if (Math.abs(elapsed) > v || u == "second")
        return rtf.format(
          Math.round(elapsed / v),
          u as Intl.RelativeTimeFormatUnit
        );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        paddingTop: 15,
      }}
    >
      <a
        href={release?.html_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            background: "#FFFFFF10",
            borderColor: "#FFFFFF15",
            borderWidth: 1,
            borderRadius: 8,
            padding: "4px 10px",
            maxWidth: "fit-content",
            transition: "all 0.2s ease",
            cursor: "pointer",
          }}
          onMouseOver={(e) => {
            if (!release) return;
            e.currentTarget.style.background = "#FFFFFF20";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseOut={(e) => {
            if (!release) return;
            e.currentTarget.style.background = "#FFFFFF10";
            e.currentTarget.style.transform = "translateY(0)";
          }}
          onMouseDown={(e) => {
            if (!release) return;
            e.currentTarget.style.background = "#FFFFFF20";
            e.currentTarget.style.transform = "translateY(1px)";
          }}
        >
          {!release && <div>Loading release...</div>}
          {release && (
            <div
              style={{
                display: "flex",
              }}
            >
              <p style={{ marginRight: "10px", margin: "0" }}>
                v{release.tag_name}
              </p>
              <div style={{ marginRight: 5 }} />
              <p
                style={{ marginRight: "10px", margin: "0", color: "#FFFFFF99" }}
              >
                published {getRelativeTime(new Date(release.published_at))}
              </p>
            </div>
          )}
        </div>
      </a>
    </div>
  );
}
