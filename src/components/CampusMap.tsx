import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { MAP_CONFIG } from '../config';
import { matchRegion } from '../utils/regionMatcher';
import type { Region, Work } from '../types';

interface SubmitModeProps {
  mode: 'submit';
  regions: Region[];
  onLocationConfirm: (mapX: number, mapY: number, regionName: string) => void;
}

interface BrowseModeProps {
  mode: 'browse';
  regions: Region[];
  works: Work[];
  selectedWorkId?: string | null;
  onWorkClick: (work: Work) => void;
  onClusterClick: (works: Work[], regionName: string) => void;
  onMapClick?: () => void; // called when user clicks empty map area
  flyToCoord?: { x: number; y: number; offsetX?: number; offsetY?: number } | null; // offsetX: shift pin left (for right sidebars); offsetY: shift pin up (for bottom cards)
  // Create mode overlay: dims pins and allows placing a submission pin
  createMode?: boolean;
  topInset?: number;
  onCreateLocationPick?: (mapX: number, mapY: number, regionName: string) => void;
}

type CampusMapProps = SubmitModeProps | BrowseModeProps;

type MarkerWithWork = L.Marker & {
  _work?: Work;
  _realLatLng?: L.LatLng;
  _baseZIndexOffset?: number;
};

type MarkerCluster = L.Marker & {
  getAllChildMarkers: () => MarkerWithWork[];
  getBounds: () => L.LatLngBounds;
};

type MarkerClusterClickEvent = L.LeafletEvent & {
  layer: MarkerCluster;
};

type MarkerClusterGroup = L.LayerGroup & {
  getLayers: () => L.Layer[];
  addLayer: (layer: L.Layer) => MarkerClusterGroup;
  on: (type: 'clusterclick', fn: (event: MarkerClusterClickEvent) => void) => MarkerClusterGroup;
  _featureGroup?: { _container?: HTMLElement };
  _container?: HTMLElement;
};

type LeafletWithMarkerCluster = typeof L & {
  markerClusterGroup: (options: {
    showCoverageOnHover: boolean;
    zoomToBoundsOnClick: boolean;
    maxClusterRadius: number;
    disableClusteringAtZoom: number;
    iconCreateFunction: (cluster: MarkerCluster) => L.DivIcon;
  }) => MarkerClusterGroup;
};

interface FanLayoutState {
  centerWorkId: string | null;
  fannedWorkIds: Set<string>;
  overflowWorkIds: Set<string>;
}

const MIN_PIN_SIZE = 28;
const MAX_PIN_SIZE = 74;
const SELECTED_PIN_SIZE = 84;
const FAN_DIM_OPACITY = 0.35;
const CREATE_PIN_PANE = 'create-pin-pane';

function createEmptyFanLayout(): FanLayoutState {
  return {
    centerWorkId: null,
    fannedWorkIds: new Set(),
    overflowWorkIds: new Set(),
  };
}

const CREATE_PIN_WIDTH = 30;
const CREATE_PIN_HEIGHT = 42;

const PIN_ICON = L.divIcon({
  html: `
    <svg width="${CREATE_PIN_WIDTH}" height="${CREATE_PIN_HEIGHT}" viewBox="0 0 30 42" aria-hidden="true" focusable="false" style="display:block;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.35))">
      <path d="M15 41C15 41 3 25.8 3 15.4C3 8.55 8.37 3 15 3C21.63 3 27 8.55 27 15.4C27 25.8 15 41 15 41Z" fill="var(--accent)" stroke="rgba(255,255,255,0.92)" stroke-width="2" />
      <circle cx="15" cy="15.4" r="5.2" fill="white" opacity="0.95" />
    </svg>
  `,
  className: 'sounddrop-create-pin',
  iconSize: [CREATE_PIN_WIDTH, CREATE_PIN_HEIGHT],
  iconAnchor: [CREATE_PIN_WIDTH / 2, CREATE_PIN_HEIGHT],
});

// Pin size scales with zoom; floor kept large enough that the photo is always readable
function pinSize(zoom: number, selected: boolean): number {
  if (selected) return SELECTED_PIN_SIZE;
  // zoom -2 → 28px, zoom 0 → 51px, zoom 2+ → 74px
  const clamped = Math.max(-2, Math.min(zoom, 2));
  return Math.round(MIN_PIN_SIZE + (clamped + 2) * ((MAX_PIN_SIZE - MIN_PIN_SIZE) / 4));
}

function pinBoost(likeCount: number | undefined): number {
  return Math.min(1.8, 1 + 0.2 * Math.sqrt(likeCount ?? 0));
}

function renderedPinSize(likeCount: number | undefined, selected: boolean, zoom: number): number {
  return pinSize(zoom, selected) * pinBoost(likeCount);
}

function baseMarkerZIndexOffset(likeCount: number | undefined): number {
  return (likeCount ?? 0) * 10;
}

function angleFromTop(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
}

function markerOpacity(workId: string, fanLayout: FanLayoutState): number {
  if (!fanLayout.centerWorkId) return 1;
  if (workId === fanLayout.centerWorkId || fanLayout.fannedWorkIds.has(workId)) return 1;
  return FAN_DIM_OPACITY;
}

function workIcon(thumbnailUrl: string | null, likeCount: number | undefined, selected: boolean, zoom: number = 1, inFan: boolean = false) {
  const fanBoost = inFan && !selected ? 1.35 : 1;
  const size = renderedPinSize(likeCount, selected, zoom) * fanBoost;
  const border = selected
    ? '3px solid rgba(160,40,45,0.9)'
    : '2px solid rgba(255,255,255,0.55)';
  const shadow = selected
    ? '0 0 12px rgba(160,40,45,0.7), 0 0 24px rgba(160,40,45,0.3)'
    : '0 2px 8px rgba(0,0,0,0.55)';
  const bg = thumbnailUrl
    ? `url(${thumbnailUrl}) center/cover no-repeat`
    : 'linear-gradient(135deg, rgba(80,80,85,0.8), rgba(50,50,55,0.8))';

  // Subtle neutral ring for lift on busy map areas — no red halo
  const glow = selected ? '' : `<div style="
    position:absolute;inset:-3px;border-radius:50%;
    border:1px solid rgba(255,255,255,0.12);
    pointer-events:none;
  "></div>`;

  return L.divIcon({
    html: `<div style="
      position:relative;
      width:${size}px;height:${size}px;
      border-radius:50%;
      border:${border};
      background:${bg};
      box-shadow:${shadow};
      transform:translate(-50%,-50%);
      transition:width 0.22s ease, height 0.22s ease, transform 0.22s ease;
      display:flex;align-items:center;justify-content:center;
    ">${glow}</div>`,
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function initMap(container: HTMLDivElement): L.Map {
  const bounds = L.latLngBounds(
    MAP_CONFIG.bounds[0] as L.LatLngTuple,
    MAP_CONFIG.bounds[1] as L.LatLngTuple,
  );

  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: MAP_CONFIG.zoom.max,
    attributionControl: false,
    zoomControl: false,
    inertia: true,
    inertiaDeceleration: 2000,
    bounceAtZoomLimits: true,
    wheelPxPerZoomLevel: 120,
  });

  L.imageOverlay(MAP_CONFIG.image, bounds).addTo(map);
  map.createPane(CREATE_PIN_PANE);
  const createPinPane = map.getPane(CREATE_PIN_PANE);
  if (createPinPane) {
    createPinPane.style.zIndex = '900';
    createPinPane.style.pointerEvents = 'none';
  }
  map.fitBounds(bounds);
  // Start a bit more zoomed-in so the map feels full, not empty
  map.setZoom(map.getZoom() + 1, { animate: false });
  map.setMaxBounds(bounds.pad(0.45)); // loose — pan must clear bottom popup / right sidebar
  map.options.maxBoundsViscosity = 0; // no elastic rebound — pans to selected pins stay put

  return map;
}

function clusterSize(count: number): number {
  if (count <= 5) return 36;
  if (count <= 20) return 44;
  return 52;
}

export default function CampusMap(props: CampusMapProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerByWorkIdRef = useRef<Map<string, MarkerWithWork>>(new Map());
  const fanLayoutRef = useRef<FanLayoutState>(createEmptyFanLayout());
  const fanLineLayerRef = useRef<L.LayerGroup | null>(null);
  const [fanCenterWorkId, setFanCenterWorkId] = useState<string | null>(null);

  // ── Submit mode state ──
  const markerRef = useRef<L.Marker | null>(null);
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>(null);
  const [regionName, setRegionName] = useState<string>('');
  const pinPosRef = useRef<{ x: number; y: number } | null>(null);
  pinPosRef.current = pinPos;

  // ── Browse mode cluster layer ref ──
  const clusterGroupRef = useRef<MarkerClusterGroup | null>(null);

  // ── Browse + createMode pin state ──
  const createMarkerRef = useRef<L.Marker | null>(null);
  const createModeRegionsRef = useRef<Region[]>([]);
  const createModePickRef = useRef<BrowseModeProps['onCreateLocationPick']>(undefined);

  const syncBrowseMarkerVisuals = useCallback(() => {
    if (propsRef.current.mode !== 'browse' || !clusterGroupRef.current || !mapRef.current) return;
    const zoom = mapRef.current.getZoom();
    const selectedId = (propsRef.current as BrowseModeProps).selectedWorkId ?? null;
    const fanLayout = fanLayoutRef.current;

    clusterGroupRef.current.getLayers().forEach((layer: L.Layer) => {
      const marker = layer as MarkerWithWork;
      if (!marker._work) return;
      const work = marker._work;
      const isSelected = work.id === selectedId;
      const isFanCenter = work.id === fanLayout.centerWorkId;
      const isInFan = fanLayout.fannedWorkIds.has(work.id);
      marker.setIcon(workIcon(work.thumbnailUrl || work.imageUrl, work.likeCount, isSelected, zoom, isInFan));
      marker.setZIndexOffset(
        baseMarkerZIndexOffset(work.likeCount)
        + (isSelected ? 10000 : 0)
        + (isFanCenter ? 50000 : 0)
        + (isInFan ? 25000 : 0),
      );
      marker.setOpacity(markerOpacity(work.id, fanLayout));
    });
  }, []);

  const clearFanVisuals = useCallback(() => {
    const map = mapRef.current;
    if (map && fanLineLayerRef.current) {
      map.removeLayer(fanLineLayerRef.current);
    }
    fanLineLayerRef.current = null;

    if (clusterGroupRef.current) {
      clusterGroupRef.current.getLayers().forEach((layer: L.Layer) => {
        const marker = layer as MarkerWithWork;
        if (marker._work && marker._realLatLng) {
          marker.setLatLng(marker._realLatLng);
        }
      });
    }

    fanLayoutRef.current = createEmptyFanLayout();
    syncBrowseMarkerVisuals();
  }, [syncBrowseMarkerVisuals]);

  const collapseFan = useCallback(() => {
    clearFanVisuals();
    setFanCenterWorkId(null);
  }, [clearFanVisuals]);

  const placeCreatePin = useCallback((latlng: L.LatLng) => {
    const map = mapRef.current;
    if (!map) return;

    const { lat: y, lng: x } = latlng;
    if (createMarkerRef.current) {
      createMarkerRef.current.setLatLng(latlng);
    } else {
      createMarkerRef.current = L.marker(latlng, {
        icon: PIN_ICON,
        pane: CREATE_PIN_PANE,
        zIndexOffset: 1000000,
        interactive: false,
      }).addTo(map);
    }

    const origX = x / MAP_CONFIG.scale;
    const origY = y / MAP_CONFIG.scale;
    const zoom = map.getZoom();
    const result = matchRegion(x, y, zoom, createModeRegionsRef.current);
    createModePickRef.current?.(origX, origY, result.name);
  }, []);

  // ── Map init (shared) ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = initMap(containerRef.current);
    mapRef.current = map;

    if (props.mode === 'submit') {
      const updateRegion = (x: number, y: number) => {
        if (props.regions.length === 0) return;
        const zoom = map.getZoom();
        const result = matchRegion(x, y, zoom, props.regions);
        setRegionName(result.name);
      };

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: y, lng: x } = e.latlng;

        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng);
        } else {
          const marker = L.marker(e.latlng, {
            icon: PIN_ICON,
            pane: CREATE_PIN_PANE,
            zIndexOffset: 1000000,
            interactive: false,
          }).addTo(map);
          markerRef.current = marker;
        }

        setPinPos({ x, y });
        updateRegion(x, y);
      });

      map.on('zoomend', () => {
        const pos = pinPosRef.current;
        if (pos) {
          updateRegion(pos.x, pos.y);
        }
      });
    }

    // Browse mode: click empty map to dismiss UI (skip if createMode)
    if (props.mode === 'browse') {
      map.on('click', () => {
        collapseFan();
        const bp = propsRef.current as BrowseModeProps;
        if (!bp.createMode && bp.onMapClick) {
          bp.onMapClick();
        }
      });
      let lastZoom = map.getZoom();
      map.on('zoomend', () => {
        const z = map.getZoom();
        if (z === lastZoom) return; // ignore spurious zoomend from flyTo / bounce
        lastZoom = z;
        collapseFan();
      });
    }

    const markerByWorkId = markerByWorkIdRef.current;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      clusterGroupRef.current = null;
      markerByWorkId.clear();
      fanLayoutRef.current = createEmptyFanLayout();
      fanLineLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Browse mode: fly to coordinate when requested ──
  useEffect(() => {
    if (props.mode !== 'browse' || !props.flyToCoord || !mapRef.current) return;
    const { x, y, offsetX, offsetY } = props.flyToCoord;
    const map = mapRef.current;
    const target = L.latLng(y * MAP_CONFIG.scale, x * MAP_CONFIG.scale);
    const currentZoom = map.getZoom();
    const targetZoom = currentZoom; // keep current zoom, only pan

    // Shift target in screen-pixel space so pin appears offset from center
    if (offsetX || offsetY) {
      const targetPoint = map.project(target, targetZoom);
      if (offsetX) targetPoint.x += offsetX / 2; // shift target right = pin appears left
      if (offsetY) targetPoint.y += offsetY / 2; // shift target down = pin appears higher
      const adjusted = map.unproject(targetPoint, targetZoom);
      map.flyTo(adjusted, targetZoom, { animate: true, duration: 0.5 });
    } else {
      map.flyTo(target, targetZoom, { animate: true, duration: 0.5 });
    }
  }, [props.mode === 'browse' ? (props as BrowseModeProps).flyToCoord : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browse mode: highlight selected marker ──
  useEffect(() => {
    if (props.mode !== 'browse' || !clusterGroupRef.current || !mapRef.current) return;
    syncBrowseMarkerVisuals();
  }, [props.mode === 'browse' ? (props as BrowseModeProps).selectedWorkId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browse mode: resize pins on zoom ──
  useEffect(() => {
    if (props.mode !== 'browse') return;
    const map = mapRef.current;
    if (!map) return;

    const updatePinSizes = () => {
      if (!clusterGroupRef.current) return;
      syncBrowseMarkerVisuals();
    };

    map.on('zoomend', updatePinSizes);
    return () => { map.off('zoomend', updatePinSizes); };
  }, [props.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit mode: update region when regions list loads async ──
  useEffect(() => {
    if (props.mode !== 'submit') return;
    if (pinPos && props.regions.length > 0 && mapRef.current) {
      const zoom = mapRef.current.getZoom();
      const result = matchRegion(pinPos.x, pinPos.y, zoom, props.regions);
      setRegionName(result.name);
    }
  }, [props.mode === 'submit' ? props.regions : null, pinPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browse mode: rebuild cluster group whenever works change ──
  useEffect(() => {
    if (props.mode !== 'browse') return;
    const map = mapRef.current;
    if (!map) return;

    const { works, regions, onWorkClick, onClusterClick } = props;
    const selectedId = props.selectedWorkId ?? null;

    clearFanVisuals();
    markerByWorkIdRef.current.clear();

    // Remove existing cluster group
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    if (works.length === 0) {
      setFanCenterWorkId(null);
      return;
    }

    const group = (L as LeafletWithMarkerCluster).markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      maxClusterRadius: 80,
      disableClusteringAtZoom: -99, // never cluster — pins scale with zoom instead
      iconCreateFunction: (cluster: MarkerCluster) => {
        const children = cluster.getAllChildMarkers();
        const count = children.length;
        const size = clusterSize(count);

        // Determine region name from cluster center
        const boundsCluster = cluster.getBounds();
        const center = boundsCluster.getCenter();
        const centerX = center.lng;
        const centerY = center.lat;
        const zoom = map.getZoom();
        const regionResult = matchRegion(centerX, centerY, zoom, regions);
        const label = regionResult.name;

        return L.divIcon({
          html: `
            <div style="
              width:${size}px;height:${size}px;
              background:rgba(160,40,45,0.85);
              border:2px solid rgba(212,88,93,0.7);
              border-radius:50%;
              display:flex;flex-direction:column;
              align-items:center;justify-content:center;
              box-shadow:0 2px 8px rgba(0,0,0,0.5);
              cursor:pointer;
            ">
              <span style="color:#fff;font-size:11px;font-weight:700;line-height:1.1">${count}</span>
              <span style="color:rgba(255,200,200,0.8);font-size:9px;line-height:1.1;max-width:${size - 8}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${label}</span>
            </div>
          `,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    // Add markers for each work
    for (const work of works) {
      const latlng = L.latLng(work.mapY * MAP_CONFIG.scale, work.mapX * MAP_CONFIG.scale);
      const marker = L.marker(latlng, {
        icon: workIcon(work.thumbnailUrl || work.imageUrl, work.likeCount, work.id === selectedId, map.getZoom()),
        zIndexOffset: baseMarkerZIndexOffset(work.likeCount),
      }) as MarkerWithWork;
      // Attach work data to marker
      marker._work = work;
      marker._realLatLng = latlng;
      marker._baseZIndexOffset = baseMarkerZIndexOffset(work.likeCount);
      markerByWorkIdRef.current.set(work.id, marker);
      marker.on('click', () => {
        const currentProps = propsRef.current;
        if (currentProps.mode === 'browse' && (currentProps as BrowseModeProps).createMode) {
          collapseFan();
          placeCreatePin(latlng);
          return;
        }

        if (fanLayoutRef.current.centerWorkId === work.id) {
          collapseFan();
        } else {
          setFanCenterWorkId(work.id);
        }
        onWorkClick(work);
      });
      group.addLayer(marker);
    }

    // Handle cluster click
    group.on('clusterclick', (e: MarkerClusterClickEvent) => {
      const cluster = e.layer;
      const bounds = cluster.getBounds();
      const center = bounds.getCenter();

      const currentProps = propsRef.current;
      if (currentProps.mode === 'browse' && (currentProps as BrowseModeProps).createMode) {
        collapseFan();
        placeCreatePin(center);
        return;
      }

      const children: MarkerWithWork[] = cluster.getAllChildMarkers();
      const clusterWorks: Work[] = children
        .map((marker: MarkerWithWork) => marker._work)
        .filter((work: Work | undefined): work is Work => Boolean(work));

      const zoom = map.getZoom();
      const regionResult = matchRegion(center.lng, center.lat, zoom, regions);

      onClusterClick(clusterWorks, regionResult.name);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 2, animate: true });
    });

    map.addLayer(group);
    clusterGroupRef.current = group;
    syncBrowseMarkerVisuals();
  }, [props.mode === 'browse' ? props.works : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const browseWorksForFan = props.mode === 'browse' ? props.works : null;
  const selectedWorkIdForFan = props.mode === 'browse' ? props.selectedWorkId : null;

  // ── Browse mode: fan overlapping markers around the clicked center ──
  useEffect(() => {
    if (props.mode !== 'browse') return;
    const map = mapRef.current;
    if (!map || !clusterGroupRef.current) return;

    clearFanVisuals();
    if (!fanCenterWorkId) return;

    const centerMarker = markerByWorkIdRef.current.get(fanCenterWorkId);
    if (!centerMarker?._work || !centerMarker._realLatLng) {
      setFanCenterWorkId(null);
      return;
    }

    const markers = clusterGroupRef.current.getLayers()
      .filter((layer: L.Layer): layer is MarkerWithWork => Boolean((layer as MarkerWithWork)._work));
    const selectedId = selectedWorkIdForFan ?? null;
    const zoom = map.getZoom();
    const centerPoint = map.latLngToContainerPoint(centerMarker._realLatLng);
    const maxPinSize = markers.reduce((max, marker) => {
      const work = marker._work!;
      return Math.max(max, renderedPinSize(work.likeCount, work.id === selectedId, zoom));
    }, MIN_PIN_SIZE);
    const overlapRadius = maxPinSize * 2.5;
    // Per-pin radius is computed below for consistent edge-to-edge gap.
    const centerIsSelected = centerMarker._work.id === selectedId;
    const centerRadiusPx = renderedPinSize(centerMarker._work.likeCount, centerIsSelected, zoom) / 2;
    const FAN_EDGE_GAP = 14; // constant visual gap between center pin edge and each fan pin edge

    const candidates = markers
      .filter((marker) => marker !== centerMarker && marker._work && marker._realLatLng)
      .map((marker) => {
        const point = map.latLngToContainerPoint(marker._realLatLng!);
        const dx = point.x - centerPoint.x;
        const dy = point.y - centerPoint.y;
        return {
          marker,
          work: marker._work!,
          distance: Math.hypot(dx, dy),
          sortAngle: angleFromTop(dx, dy),
        };
      })
      .filter((candidate) => candidate.distance <= overlapRadius);

    if (candidates.length === 0) {
      setFanCenterWorkId(null);
      return;
    }

    const likeRanked = [...candidates].sort((a, b) => {
      const likeDiff = (b.work.likeCount ?? 0) - (a.work.likeCount ?? 0);
      if (likeDiff !== 0) return likeDiff;
      return a.work.id.localeCompare(b.work.id);
    });
    const fanned = likeRanked.slice(0, 8).sort((a, b) => {
      const angleDiff = a.sortAngle - b.sortAngle;
      if (angleDiff !== 0) return angleDiff;
      const likeDiff = (b.work.likeCount ?? 0) - (a.work.likeCount ?? 0);
      if (likeDiff !== 0) return likeDiff;
      return a.work.id.localeCompare(b.work.id);
    });
    const overflow = likeRanked.slice(8);

    const step = (Math.PI * 2) / fanned.length;

    fanned.forEach((entry, index) => {
      const angle = -Math.PI / 2 + step * index;
      const fanPinRadiusPx = (renderedPinSize(entry.work.likeCount, false, zoom) * 1.35) / 2;
      const radius = centerRadiusPx + FAN_EDGE_GAP + fanPinRadiusPx;
      const targetPoint = L.point(
        centerPoint.x + Math.cos(angle) * radius,
        centerPoint.y + Math.sin(angle) * radius,
      );
      const targetLatLng = map.containerPointToLatLng(targetPoint);
      entry.marker.setLatLng(targetLatLng);
    });

    fanLineLayerRef.current = null;
    fanLayoutRef.current = {
      centerWorkId: fanCenterWorkId,
      fannedWorkIds: new Set(fanned.map((entry) => entry.work.id)),
      overflowWorkIds: new Set(overflow.map((entry) => entry.work.id)),
    };
    syncBrowseMarkerVisuals();
  }, [
    browseWorksForFan,
    clearFanVisuals,
    fanCenterWorkId,
    props.mode,
    selectedWorkIdForFan,
    syncBrowseMarkerVisuals,
  ]);

  // ── Browse mode: dim pins when createMode is on ──
  useEffect(() => {
    if (props.mode !== 'browse' || !clusterGroupRef.current) return;
    const group = clusterGroupRef.current;
    const container = group._featureGroup?._container || group._container;
    if (container) {
      container.style.opacity = (props as BrowseModeProps).createMode ? '0.25' : '1';
      container.style.pointerEvents = (props as BrowseModeProps).createMode ? 'none' : 'auto';
      container.style.transition = 'opacity 0.3s ease';
    }
  }, [props.mode === 'browse' ? (props as BrowseModeProps).createMode : false]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browse + createMode: place pin on map click ──
  useLayoutEffect(() => {
    if (props.mode !== 'browse') return;
    createModeRegionsRef.current = props.regions;
    createModePickRef.current = props.onCreateLocationPick;
  }, [props.regions, props.mode === 'browse' ? props.onCreateLocationPick : null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (props.mode !== 'browse') return;
    const map = mapRef.current;
    if (!map) return;
    const bp = props as BrowseModeProps;

    if (!bp.createMode) {
      // Remove create marker when leaving create mode
      if (createMarkerRef.current) {
        map.removeLayer(createMarkerRef.current);
        createMarkerRef.current = null;
      }
      return;
    }

    const handler = (e: L.LeafletMouseEvent) => placeCreatePin(e.latlng);

    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [props.mode === 'browse' ? (props as BrowseModeProps).createMode : false, placeCreatePin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit mode confirm ──
  const handleConfirm = () => {
    if (props.mode !== 'submit' || !pinPos) return;
    // Convert web-image coordinates back to original-resolution coordinates for storage
    const origX = pinPos.x / MAP_CONFIG.scale;
    const origY = pinPos.y / MAP_CONFIG.scale;
    props.onLocationConfirm(origX, origY, regionName || '校园内');
  };

  // ── Minimap ──
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const minimapImgRef = useRef<HTMLImageElement | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const MINI_W = isMobile ? 90 : 140;
  const MINI_H = Math.round(MINI_W * (MAP_CONFIG.bounds[1][0] / MAP_CONFIG.bounds[1][1]));

  const drawMinimap = useCallback(() => {
    const canvas = minimapRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw map image
    if (minimapImgRef.current) {
      ctx.drawImage(minimapImgRef.current, 0, 0, MINI_W, MINI_H);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, MINI_W, MINI_H);
    }

    // Draw viewport rectangle
    const bounds = map.getBounds();
    const imgBounds = MAP_CONFIG.bounds;
    const totalW = imgBounds[1][1]; // max x (lng)
    const totalH = imgBounds[1][0]; // max y (lat)

    const x1 = Math.max(0, (bounds.getWest() / totalW) * MINI_W);
    const y1 = Math.max(0, ((totalH - bounds.getNorth()) / totalH) * MINI_H);
    const x2 = Math.min(MINI_W, (bounds.getEast() / totalW) * MINI_W);
    const y2 = Math.min(MINI_H, ((totalH - bounds.getSouth()) / totalH) * MINI_H);

    ctx.strokeStyle = 'rgba(160, 40, 45, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    ctx.fillStyle = 'rgba(160, 40, 45, 0.1)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }, [MINI_H, MINI_W]);

  // Load minimap image + attach move listeners
  useEffect(() => {
    const img = new Image();
    img.src = MAP_CONFIG.image;
    img.onload = () => {
      minimapImgRef.current = img;
      drawMinimap();
    };
  }, [drawMinimap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.on('moveend zoomend', drawMinimap);
    drawMinimap();
    return () => { map.off('moveend zoomend', drawMinimap); };
  }, [drawMinimap]);

  // Click on minimap to navigate
  const handleMinimapClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const map = mapRef.current;
    const canvas = minimapRef.current;
    if (!map || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const imgBounds = MAP_CONFIG.bounds;
    const lng = (x / MINI_W) * imgBounds[1][1];
    const lat = imgBounds[1][0] - (y / MINI_H) * imgBounds[1][0];
    map.panTo(L.latLng(lat, lng), { animate: true, duration: 0.3 });
  }, [MINI_H, MINI_W]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Browse + createMode hint */}
      {props.mode === 'browse' && (props as BrowseModeProps).createMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white text-sm px-4 py-2 rounded-full pointer-events-none transition-[top]"
          style={{ top: (props as BrowseModeProps).topInset ?? 64 }}
        >
          点击地图选择地点
        </div>
      )}

      {/* Submit mode overlays */}
      {props.mode === 'submit' && (
        <>
          {!pinPos && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white text-sm px-4 py-2 rounded-full pointer-events-none">
              <span className="hidden sm:inline">点击地图选择地点，放大后可以选得更精确</span>
              <span className="sm:hidden">点击地图选择地点</span>
            </div>
          )}

          {pinPos && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
              <button
                type="button"
                onClick={handleConfirm}
                className="px-6 py-3 rounded-full shadow-lg text-sm font-medium transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(160, 40, 45, 0.5)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(160, 40, 45, 0.75)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(160, 40, 45, 0.5)'; }}
              >
                确认地点 →
              </button>
            </div>
          )}
        </>
      )}

      {/* Browse mode hint */}
      {props.mode === 'browse' && props.works.length === 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white text-sm px-4 py-2 rounded-full pointer-events-none whitespace-nowrap">
          暂无作品
        </div>
      )}

      {/* Minimap */}
      <canvas
        ref={minimapRef}
        width={MINI_W}
        height={MINI_H}
        onClick={handleMinimapClick}
        className="absolute left-4 z-[900] cursor-pointer"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          opacity: 0.85,
        }}
      />
    </div>
  );
}
