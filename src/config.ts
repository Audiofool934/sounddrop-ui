// Web image is 3000x2534. Original is 14999x12669.
// Scale factor: 3000/14999 ≈ 0.2
const SCALE = 3000 / 14999;

export const MAP_CONFIG = {
  image: '/maps/map-zgc-web.jpg',
  // Bounds match actual pixel dimensions of the web image
  bounds: [[0, 0], [2534, 3000]] as [[number, number], [number, number]],
  center: [1267, 1500] as [number, number],
  // Scale factor for converting original-resolution region coords to web-image coords
  scale: SCALE,
  zoom: {
    min: -1,
    max: 4,
    default: 0,
    level1Max: 1,
    level2Max: 2.5,
  },
};

export const STYLE_TAGS = [
  '温暖钢琴', '安静民谣', 'Lo-fi', '空灵电子', '古典弦乐', '校园民谣',
  '爵士', '轻摇滚', '环境音乐', '后摇', '新世纪', 'R&B',
  '吉他独奏', '大提琴', '合成器', '竖琴',
  '舒缓', '欢快', '忧伤', '梦幻', '治愈', '孤独',
];
