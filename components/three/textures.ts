import * as THREE from "three";

/**
 * Small procedurally-drawn textures (canvas-generated, no external image
 * assets) for the low-poly 3D scenes (see HubScene.tsx) — all tile
 * seamlessly via RepeatWrapping.
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

