import type { ReactNode } from "react";
import { FigmaScreen } from "./FigmaScreen";
import "../styles/figma-route.css";

/**
 * Exact-Figma visual frame with a functional React layer above it.
 *
 * The Figma artwork is never restyled or rebuilt. Interactive/dynamic React
 * controls are supplied as children and positioned by the route itself.
 * This prevents the old CSS approximation from silently becoming the visual
 * source of truth again.
 */
export function FigmaRouteFrame({
  node,
  values,
  images,
  textReplacements,
  children,
  onClick,
  className,
}: {
  node: string;
  values?: Record<string, string>;
  images?: Record<string, string>;
  textReplacements?: Record<string, string | string[]>;
  children?: ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div className={`figma-route-frame${className ? ` ${className}` : ""}`} onClick={onClick}>
      <FigmaScreen node={node} values={values} images={images} textReplacements={textReplacements} />
      {children}
    </div>
  );
}
