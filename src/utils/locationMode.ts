export const NO_LOCATION_REGION_NAME = '图片转音乐';
export const NO_LOCATION_MAP_X = -1;
export const NO_LOCATION_MAP_Y = -1;

export function isNoLocationItem(item: { mapX: number; mapY: number; regionName: string }) {
  return (
    item.regionName === NO_LOCATION_REGION_NAME ||
    (item.mapX === NO_LOCATION_MAP_X && item.mapY === NO_LOCATION_MAP_Y)
  );
}
