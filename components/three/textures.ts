import * as THREE from "three";

/**
 * Small procedurally-drawn textures (canvas-generated, no external image
 * assets) for the low-poly gym scene — a brick pattern for walls and a
 * scalloped tile pattern for roofs. Both tile seamlessly via RepeatWrapping.
 */

function makeCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBrickTexture(
  repeatX = 3,
  repeatY = 2,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const mortarColor = "#b8a888";
    const brickColor = "#a1503a";
    const brickShadow = "#8a3f2c";
    const brickW = 32;
    const brickH = 16;
    const gap = 3;

    ctx.fillStyle = mortarColor;
    ctx.fillRect(0, 0, 128, 128);

    for (let row = 0, y = 0; y < 128; row++, y += brickH) {
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let x = -brickW + offset; x < 128; x += brickW) {
        ctx.fillStyle = brickShadow;
        ctx.fillRect(x + gap / 2, y + gap / 2, brickW - gap, brickH - gap);
        ctx.fillStyle = brickColor;
        ctx.fillRect(x + gap / 2, y + gap / 2, brickW - gap - 2, brickH - gap - 2);
      }
    }
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createStoneTexture(
  repeatX = 2,
  repeatY = 2,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const base = "#dcd0b4";
    const blotchColors = ["#cabf9f", "#e8dfc6", "#c3b696"];

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 4 + Math.random() * 10;
      ctx.fillStyle = blotchColors[i % blotchColors.length];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createSandTexture(
  repeatX = 6,
  repeatY = 6,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const base = "#e3c98f";
    const speckColors = ["#d4b877", "#f0dba6", "#c9ab6c"];

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      ctx.fillStyle = speckColors[i % speckColors.length];
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createDirtGrassTexture(
  repeatX = 8,
  repeatY = 8,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const grass = "#5c7a3a";
    const grassTones = ["#6f8f46", "#4d6930", "#547a3d"];
    const dirtTones = ["#8a6f4d", "#7c6244", "#95795a"];

    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, 128, 128);

    // sparse dirt patches — grass should dominate
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 3 + Math.random() * 6;
      ctx.fillStyle = dirtTones[i % dirtTones.length];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.lineWidth = 1.5;
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const h = 3 + Math.random() * 4;
      const lean = (Math.random() - 0.5) * 3;
      ctx.strokeStyle = grassTones[i % grassTones.length];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - h);
      ctx.stroke();
    }
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createCobblestoneTexture(
  repeatX = 4,
  repeatY = 4,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const grout = "#6b6558";
    const stoneColors = ["#8f897c", "#a39c8d", "#736c60", "#948d7e"];

    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 55; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 6 + Math.random() * 7;
      ctx.fillStyle = stoneColors[i % stoneColors.length];
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        r,
        r * (0.75 + Math.random() * 0.25),
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createRoofTileTexture(
  repeatX = 8,
  repeatY = 3,
): THREE.CanvasTexture {
  const texture = makeCanvasTexture(128, (ctx) => {
    const base = "#7a3324";
    const tile = "#a1503a";
    const highlight = "#c06a4a";
    const tileW = 16;
    const tileH = 22;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);

    for (let row = 0, y = 0; y < 128 + tileH; row++, y += tileH * 0.55) {
      const offset = row % 2 === 0 ? 0 : tileW / 2;
      for (let x = -tileW; x < 128 + tileW; x += tileW) {
        const cx = x + offset + tileW / 2;
        ctx.fillStyle = tile;
        ctx.beginPath();
        ctx.ellipse(cx, y, tileW / 2 - 1, tileH / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.ellipse(cx, y - 3, tileW / 3.5, tileH / 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  texture.repeat.set(repeatX, repeatY);
  return texture;
}
