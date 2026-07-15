"use client";

import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Map as MapIcon } from "lucide-react";
import type { LocationData } from "./types";

interface BoxNode {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  children: BoxNode[];
  location: LocationData;
}

interface WorldMapProps {
  locations: LocationData[];
  selectedLocId?: string;
  onSelectLocId: (id: string) => void;
}

export function WorldMap({
  locations,
  selectedLocId,
  onSelectLocId,
}: WorldMapProps) {
  // Zoom and Pan States for Visualizer
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Build tree and layout computation
  const { roots, nodeMap } = useMemo(() => {
    const nodeMap = new Map<string, BoxNode>();

    // 1. Initialize all nodes
    locations.forEach((loc) => {
      const nameAttr = loc.attributes?.find(
        (a) => a.name.toLowerCase() === "name",
      )?.value;
      const name = nameAttr ? nameAttr : loc.id;
      nodeMap.set(loc.id, {
        id: loc.id,
        name,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        children: [],
        location: loc,
      });
    });

    const roots: BoxNode[] = [];

    // 2. Link parents and children
    locations.forEach((loc) => {
      const node = nodeMap.get(loc.id)!;
      if (loc.parentId && nodeMap.has(loc.parentId)) {
        nodeMap.get(loc.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // 3. Measure recursively
    const measureNode = (node: BoxNode) => {
      const textWidth = node.name.length * 7.2 + 24;

      if (node.children.length === 0) {
        node.width = Math.max(140, textWidth);
        node.height = 70;
        return;
      }

      node.children.forEach((child) => measureNode(child));

      const cols = Math.ceil(Math.sqrt(node.children.length));
      const rows = Math.ceil(node.children.length / cols);

      const gap = 20;
      const padLeft = 20;
      const padRight = 20;
      const padTop = 45;
      const padBottom = 20;

      const colWidths = new Array(cols).fill(0);
      const rowHeights = new Array(rows).fill(0);

      node.children.forEach((child, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        colWidths[col] = Math.max(colWidths[col], child.width);
        rowHeights[row] = Math.max(rowHeights[row], child.height);
      });

      const totalGridWidth =
        colWidths.reduce((sum, w) => sum + w, 0) + (cols - 1) * gap;
      const totalGridHeight =
        rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * gap;

      node.width = Math.max(
        180,
        totalGridWidth + padLeft + padRight,
        textWidth,
      );
      node.height = Math.max(100, totalGridHeight + padTop + padBottom);

      let yOffset = padTop;
      for (let r = 0; r < rows; r++) {
        let xOffset = padLeft;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= node.children.length) break;
          const child = node.children[idx];

          const cellWidth = colWidths[c];
          const cellHeight = rowHeights[r];
          child.x = xOffset + (cellWidth - child.width) / 2;
          child.y = yOffset + (cellHeight - child.height) / 2;

          xOffset += cellWidth + gap;
        }
        yOffset += rowHeights[r] + gap;
      }
    };

    roots.forEach((root) => measureNode(root));

    // 4. Position roots and assign global coordinates
    const assignGlobalCoordinates = (
      node: BoxNode,
      parentX: number,
      parentY: number,
    ) => {
      node.x += parentX;
      node.y += parentY;
      node.children.forEach((child) => {
        assignGlobalCoordinates(child, node.x, node.y);
      });
    };

    const cols = Math.ceil(Math.sqrt(roots.length));
    const gap = 40;

    const colWidths = new Array(cols).fill(0);
    const rowHeights: number[] = [];

    roots.forEach((root, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      colWidths[col] = Math.max(colWidths[col], root.width);
      if (rowHeights[row] === undefined) rowHeights[row] = 0;
      rowHeights[row] = Math.max(rowHeights[row], root.height);
    });

    let yOffset = 40;
    let maxWidth = 0;

    for (let r = 0; r < rowHeights.length; r++) {
      let xOffset = 40;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= roots.length) break;
        const root = roots[idx];

        root.x = xOffset;
        root.y = yOffset;

        assignGlobalCoordinates(root, 0, 0);
        xOffset += colWidths[c] + gap;
      }
      yOffset += rowHeights[r] + gap;
      maxWidth = Math.max(maxWidth, xOffset);
    }

    return { roots, nodeMap };
  }, [locations]);

  // Connection lines computation
  const connectionLines = useMemo(() => {
    const lines: any[] = [];
    const seen = new Set<string>();

    locations.forEach((loc) => {
      const nodeA = nodeMap.get(loc.id);
      if (!nodeA) return;

      loc.connections?.forEach((conn, cIdx) => {
        const nodeB = nodeMap.get(conn.targetId);
        if (!nodeB) return;

        const isParentChild =
          loc.parentId === conn.targetId || nodeB.location.parentId === loc.id;
        if (isParentChild) return;

        const sortedIds = [loc.id, conn.targetId].sort();
        const key = conn.bidirectional
          ? `bidi-${sortedIds[0]}-${sortedIds[1]}`
          : `uni-${loc.id}-${conn.targetId}`;

        if (seen.has(key)) return;
        seen.add(key);

        const x1 = nodeA.x + nodeA.width / 2;
        const y1 = nodeA.y + nodeA.height / 2;
        const x2 = nodeB.x + nodeB.width / 2;
        const y2 = nodeB.y + nodeB.height / 2;

        lines.push({
          id: `${loc.id}-${conn.targetId}-${cIdx}`,
          x1,
          y1,
          x2,
          y2,
          portalName: conn.portalName,
          portalState: conn.portalStateDescriptor,
          vision: conn.visionProp,
          sound: conn.soundProp,
          bidirectional: conn.bidirectional,
          sourceId: loc.id,
          targetId: conn.targetId,
        });
      });
    });

    return lines;
  }, [locations, nodeMap]);

  // Recursive render helper for boxes
  const renderNode = (node: BoxNode) => {
    const isSelected = selectedLocId === node.id;

    // Find parent connection details
    const parentLoc = locations.find((l) => l.id === node.location.parentId);
    const childToParentConn = node.location.parentId
      ? node.location.connections?.find(
          (c) => c.targetId === node.location.parentId,
        )
      : undefined;
    const parentToChildConn =
      node.location.parentId && parentLoc
        ? parentLoc.connections?.find((c) => c.targetId === node.id)
        : undefined;

    const hasParentConn = !!(childToParentConn || parentToChildConn);
    const portalName =
      childToParentConn?.portalName || parentToChildConn?.portalName;

    return (
      <g key={node.id}>
        {/* Box */}
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={8}
          onClick={(e) => {
            e.stopPropagation();
            onSelectLocId(node.id);
          }}
          className={`transition-all cursor-pointer ${
            isSelected
              ? "fill-primary/5 stroke-primary stroke-2"
              : node.children.length > 0
                ? "fill-secondary/5 stroke-border/40 hover:stroke-border/80"
                : "fill-secondary/20 stroke-border/40 hover:stroke-foreground/40 hover:fill-secondary/30"
          }`}
          style={{ strokeWidth: isSelected ? 2 : 1 }}
          strokeDasharray={
            hasParentConn
              ? "4, 4"
              : node.children.length > 0
                ? "3, 3"
                : undefined
          }
        />

        {/* Label */}
        <text
          x={node.x + 12}
          y={node.y + 24}
          className={`text-xs font-mono select-none font-semibold ${
            isSelected ? "fill-primary font-bold" : "fill-muted-foreground"
          }`}
        >
          {node.name}
        </text>

        {/* Portal Name on Boundary of Child */}
        {hasParentConn && portalName && (
          <g transform={`translate(${node.x + node.width / 2}, ${node.y})`}>
            <rect
              x={-((portalName.length * 5) / 2) - 4}
              y={-6}
              width={portalName.length * 5 + 8}
              height={12}
              rx={3}
              className="fill-zinc-900 stroke stroke-border/40"
              style={{ strokeWidth: 0.5 }}
            />
            <text
              textAnchor="middle"
              y={3}
              className="text-[8px] font-mono fill-primary font-semibold select-none"
            >
              {portalName}
            </text>
          </g>
        )}

        {/* Render children inside */}
        {node.children.map((child) => renderNode(child))}
      </g>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center pb-2">
        {/* Controls */}
        <div className="flex gap-1 bg-secondary/15 p-1 rounded border border-border/10">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
            className="size-7 cursor-pointer hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
            title="Zoom In"
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            className="size-7 cursor-pointer hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
            title="Zoom Out"
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="size-7 cursor-pointer hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
            title="Reset view"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Canvas container */}
      <div className="relative border border-border/35 bg-zinc-950/95 rounded-lg overflow-hidden h-[450px]">
        <svg
          width="100%"
          height="100%"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full select-none ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <defs>
            <pattern
              id="grid-pattern"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                className="text-muted-foreground/10"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />

          {/* Draggable/scalable group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Draw Connection Lines first so they are behind boxes */}
            {connectionLines.map((line) => {
              const isSourceSelected = selectedLocId === line.sourceId;
              const isTargetSelected = selectedLocId === line.targetId;
              const isHighlighted = isSourceSelected || isTargetSelected;

              const mx = (line.x1 + line.x2) / 2;
              const my = (line.y1 + line.y2) / 2;
              const angle =
                Math.atan2(line.y2 - line.y1, line.x2 - line.x1) *
                (180 / Math.PI);

              return (
                <g key={line.id} className="transition-all">
                  {/* Glow path for highlighted connections */}
                  {isHighlighted && (
                    <line
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      className="stroke-primary/30 stroke-[4px] blur-sm animate-pulse"
                    />
                  )}

                  {/* Main Connection Line */}
                  <line
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className={`transition-all ${
                      isHighlighted
                        ? "stroke-primary stroke-2"
                        : "stroke-border/40 stroke-1"
                    }`}
                    style={{
                      strokeDasharray: line.bidirectional ? undefined : "4, 4",
                    }}
                  />

                  {/* Midpoint Direction Arrow for Uni-directional connections */}
                  {!line.bidirectional && (
                    <g transform={`translate(${mx}, ${my}) rotate(${angle})`}>
                      <path
                        d="M -4 -3.5 L 4 0 L -4 3.5 Z"
                        className={
                          isHighlighted
                            ? "fill-primary"
                            : "fill-muted-foreground/60"
                        }
                      />
                    </g>
                  )}

                  {/* Portal Name Label bubble */}
                  {line.portalName && (
                    <g
                      transform={`translate(${mx}, ${my - 12})`}
                      className="cursor-default"
                    >
                      <rect
                        x={-((line.portalName.length * 6) / 2) - 4}
                        y={-8}
                        width={line.portalName.length * 6 + 8}
                        height={16}
                        rx={4}
                        className="fill-background/90 stroke stroke-border/30"
                        style={{ strokeWidth: 0.5 }}
                      />
                      <text
                        textAnchor="middle"
                        y={3}
                        className="text-[9px] font-mono fill-muted-foreground select-none"
                      >
                        {line.portalName}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Draw Box Nodes recursively */}
            {roots.map((root) => renderNode(root))}
          </g>
        </svg>

        {/* Map Hint Overlay */}
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 border border-border/20 text-[9.5px] text-muted-foreground font-mono pointer-events-none">
          Drag to pan • Scroll or buttons to zoom • Click boxes to select
        </div>
      </div>
    </>
  );
}
