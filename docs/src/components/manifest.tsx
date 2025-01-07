/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import yaml from "js-yaml";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "nextra/mdx";

export function Manifest() {
  const [manifest, setManifest] = useState<Record<
    string,
    { url: string }
  > | null>(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchManifestAndLoad = async () => {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/Turtlepaw/clockwork/refs/heads/main/manifest.yml"
        );
        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        const data = yaml.load(await response.text());
        setManifest(data as any);
      } catch (err: any) {
        setError(err.message);
      }
    };

    fetchManifestAndLoad();
  }, []);

  const components = useMDXComponents();
  const useMDXTable = false;
  const Table = useMDXTable ? components.table || "table" : "table";
  const Thead = useMDXTable ? components.thead || "table" : "thead";
  const Tbody = useMDXTable ? components.tbody || "table" : "tbody";
  const Tr = useMDXTable ? components.tr || "table" : "tr";
  const Th = useMDXTable ? components.th || "table" : "th";
  const Td = useMDXTable ? components.td || "table" : "td";
  const Code = components.code || "code";

  if (error) {
    return <div>Error fetching release: {error}</div>;
  }

  return (
    <MDXProvider components={components}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 15,
        }}
      >
        {!manifest && <div>Loading manifest...</div>}
        {manifest && (
          <Table style={{ width: "100%", borderCollapse: "collapse" }}>
            <Thead>
              <Tr>
                <Th
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: "1px solid #FFFFFF30",
                  }}
                >
                  Package
                </Th>
                <Th
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: "1px solid #FFFFFF30",
                  }}
                >
                  URL
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {Object.entries(manifest).map(([name, { url }]) => (
                <Tr key={name}>
                  <Td
                    style={{
                      padding: "8px",
                      borderBottom: "1px solid #FFFFFF15",
                    }}
                  >
                    <Code>{name}</Code>
                  </Td>
                  <Td
                    style={{
                      padding: "8px",
                      borderBottom: "1px solid #FFFFFF15",
                    }}
                  >
                    <a
                      href={url}
                      style={{ color: "#3B82F6", textDecoration: "none" }}
                    >
                      {url.replace(".git", "")}
                    </a>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </MDXProvider>
  );
}
