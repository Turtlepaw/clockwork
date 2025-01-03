import React from "react";
import { Hash } from "lucide-react";

function generateId(text: string) {
  return text.toLowerCase().replace(/\s+/g, "-");
}

export function HeadingWithLink({
  children,
  level,
}: {
  children: React.ReactNode;
  level: number;
}) {
  const id = generateId(children as string);
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Tag id={id}>
      {children}
      <a
        href={`#${id}`}
        style={{ textDecoration: "none", color: "inherit", marginLeft: "8px" }}
      >
        <Hash size={16} />
      </a>
    </Tag>
  );
}
