/*
 * Ảnh thờ đen trắng + viền tối mờ ở góc, làm TRONG SHADER của vật liệu ảnh (MeshBasicMaterial qua onBeforeCompile):
 * không xử lý lại tệp ảnh, không dùng canvas, bật/tắt chỉ bằng uniform nên đổi cài đặt là có hiệu lực ngay.
 *
 * File này không import three: chỉ biến đổi chuỗi GLSL và hai uniform, nên thử được ngoài trình duyệt.
 */

export interface PortraitUniforms {
  /** 0 = màu gốc, 1 = đen trắng hoàn toàn. */
  uGray: { value: number };
  /** Độ tối của viền (0 = không viền). Chỉ dùng khi đen trắng. */
  uVignette: { value: number };
}

export const GRAYSCALE_VIGNETTE = 0.62;

export function createPortraitUniforms(): PortraitUniforms {
  return { uGray: { value: 0 }, uVignette: { value: 0 } };
}

/** Bật/tắt đen trắng (kèm viền tối mờ ở góc). */
export function setPortraitGrayscale(uniforms: PortraitUniforms, on: boolean): void {
  uniforms.uGray.value = on ? 1 : 0;
  uniforms.uVignette.value = on ? GRAYSCALE_VIGNETTE : 0;
}

export interface ShaderLike {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}

/** Đoạn GLSL chèn ngay sau `#include <map_fragment>` (lúc này diffuseColor đã nhân với ảnh). */
export const PORTRAIT_FRAGMENT_GLSL = `
  float pLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( pLuma ), uGray );
  vec2 pCenter = ( vPortraitUv - 0.5 ) * vec2( 1.0, 0.86 );
  float pEdge = smoothstep( 0.3, 0.72, length( pCenter ) );
  diffuseColor.rgb *= 1.0 - uVignette * pEdge;
`;

/** Gắn đen trắng + viền tối vào shader của MeshBasicMaterial có `map` (dùng trong material.onBeforeCompile). */
export function patchPortraitShader(shader: ShaderLike, uniforms: PortraitUniforms): void {
  shader.uniforms.uGray = uniforms.uGray;
  shader.uniforms.uVignette = uniforms.uVignette;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vPortraitUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPortraitUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uGray;\nuniform float uVignette;\nvarying vec2 vPortraitUv;')
    .replace('#include <map_fragment>', `#include <map_fragment>\n${PORTRAIT_FRAGMENT_GLSL}`);
}

/** Khóa cache chương trình shader (mọi ảnh thờ dùng chung một chương trình, chỉ khác uniform). */
export const PORTRAIT_PROGRAM_KEY = 'hall-portrait-gray-v1';
