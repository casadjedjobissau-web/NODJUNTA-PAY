import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { adaptiveForegroundSvg, faviconSvg, iconSvg, splashSvg } from "../src/design/brand-svg";
import { palette } from "../src/design/tokens";

interface Target {
  name: string;
  svg: string;
  size: number;
  opaque: boolean;
}

const OUT_DIR = path.resolve(process.cwd(), "assets", "brand");

const TARGETS: Target[] = [
  { name: "icon", svg: iconSvg(), size: 1024, opaque: true },
  { name: "adaptive-icon", svg: adaptiveForegroundSvg(), size: 1024, opaque: false },
  { name: "splash-icon", svg: splashSvg(), size: 1024, opaque: false },
  { name: "favicon", svg: faviconSvg(), size: 48, opaque: true },
];

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    await writeFile(path.join(OUT_DIR, `${target.name}.svg`), target.svg, "utf8");

    let image = sharp(Buffer.from(target.svg)).resize(target.size, target.size);
    if (target.opaque) {
      // As lojas não aceitam ícones com transparência.
      image = image.flatten({ background: palette.green });
    }
    await image.png().toFile(path.join(OUT_DIR, `${target.name}.png`));
    console.log(`Gerado: assets/brand/${target.name}.png (${target.size}x${target.size})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
