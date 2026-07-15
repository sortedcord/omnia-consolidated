---
title: Spatial System
description: The spatial graph model for location and perception
---

Space in Omnia is modeled as a graph, not a coordinate grid.

## The Graph Model

```
world → region → location → point of interest
```

These nodes are connected by **portals** with sound and vision propagation values. When something happens, perception information bubbles outward through portals.

Today, actors perceive:

- Co-located entities
- Their location's visible attributes

Portal-propagated perception is on the roadmap.

## Design Rationale

There are no coordinates, no pathfinding algorithms, no collision geometry. A narrative engine doesn't need a tactical simulation — a discrete graph is sufficient for modeling who is where and who can perceive whom.
