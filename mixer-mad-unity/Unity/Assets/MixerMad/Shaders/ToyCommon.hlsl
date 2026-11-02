// MixerMad toy look: shared helpers for ToyPlastic.shader and SnowIce.shader.
// Include AFTER Core.hlsl / Lighting.hlsl. No material properties live here, so every
// shader can keep its own UnityPerMaterial cbuffer (SRP Batcher compatible).
#ifndef MIXERMAD_TOY_COMMON_INCLUDED
#define MIXERMAD_TOY_COMMON_INCLUDED

// ---- Globals driven from C# (Weather, DayNight, QualityPresets). Never material properties. ----
float _MM_Wetness;      // 0..1  wet roads, glossier and darker
float _MM_Snow;         // 0..1  snow dusting on up-facing surfaces
float _MM_DayLight;     // 0.3 (night) .. 1 (noon)
float _MM_OutlineOn;    // 1 on, 0 off (per-feature toggle)
float4 _MM_SunDir;      // xyz = direction TOWARD the sun/moon, w = unused
float _MM_Time;
float _MM_ReflClip;     // 1 only while the planar reflection camera renders
float _MM_ReflPlaneY;         // unscaled-by-slowmo toy clock (sparkle); falls back to _Time.y if 0

// Discard everything under the mirror plane while rendering the reflection.
#define MM_REFLECTION_CLIP(posWS) clip((_MM_ReflClip > 0.5) ? ((posWS).y - _MM_ReflPlaneY) : 1.0)

float MM_Hash21(float2 p)
{
    p = frac(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return frac(p.x * p.y);
}

float MM_VNoise(float2 p)
{
    float2 i = floor(p), f = frac(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = MM_Hash21(i), b = MM_Hash21(i + float2(1, 0));
    float c = MM_Hash21(i + float2(0, 1)), d = MM_Hash21(i + float2(1, 1));
    return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
}

float MM_FBM(float2 p)
{
    float v = 0.0, a = 0.5;
    [unroll] for (int i = 0; i < 4; i++) { v += a * MM_VNoise(p); p *= 2.03; a *= 0.5; }
    return v;
}

// Pixel size in metres at this world position (perspective camera).
float MM_PixelWorldSize(float clipW)
{
    return 2.0 * clipW / (_ScreenParams.y * UNITY_MATRIX_P._m11);
}

// Inverted-hull offset: push the vertex along the smoothed normal by max(width, minPixels).
float3 MM_OutlineOffsetWS(float3 positionWS, float3 smoothNormalWS, float widthMetres, float minPixels)
{
    float4 cs = TransformWorldToHClip(positionWS);
    float w = max(widthMetres, minPixels * MM_PixelWorldSize(cs.w));
    return positionWS + normalize(smoothNormalWS) * (w * _MM_OutlineOn);
}

// Smooth normals are baked into vertex colour by MeshSmoothNormals (alpha = 0.5 marks "baked").
float3 MM_DecodeSmoothNormalOS(float4 vertexColor, float3 fallbackNormalOS)
{
    bool baked = abs(vertexColor.a - 0.5) < 0.02;
    return baked ? normalize(vertexColor.rgb * 2.0 - 1.0) : fallbackNormalOS;
}

#ifdef MM_USE_LIGHTING
// Second specular lobe: sharp light highlight + fresnel env reflection. Gives the glossy toy coat.
half3 MM_ClearCoat(half3 N, half3 V, Light mainLight, half strength, half smoothness, half mask)
{
    half NoV = saturate(dot(N, V));
    half3 H = SafeNormalize(mainLight.direction + V);
    half NoH = saturate(dot(N, H));
    half core = pow(NoH, lerp(24.0h, 260.0h, smoothness));
    half halo = pow(NoH, lerp(6.0h, 40.0h, smoothness)) * 0.12h;
    half lit = saturate(dot(N, mainLight.direction) * 4.0h) * mainLight.distanceAttenuation * mainLight.shadowAttenuation;
    half3 spec = mainLight.color * (core * 1.1h + halo) * lit;

    half3 R = reflect(-V, N);
    half3 env = GlossyEnvironmentReflection(R, 1.0h - smoothness, 1.0h);
    half fres = 0.04h + 0.96h * pow(1.0h - NoV, 5.0h);
    return (spec + env * fres) * strength * mask;
}

// Soft light rim (the "light" half of the dual edge; the navy half is the hull pass).
half3 MM_Rim(half3 N, half3 V, Light mainLight, half3 rimColor, half strength, half power)
{
    half rim = pow(1.0h - saturate(dot(N, V)), power);
    rim = smoothstep(0.0h, 1.0h, rim);
    half facing = lerp(0.35h, 1.0h, saturate(dot(N, mainLight.direction) * 0.5h + 0.5h));
    return rimColor * rim * strength * facing * (0.4h + 0.6h * _MM_DayLight);
}

#endif

// Shadows never go black: floor the colour at albedo * floor (scaled down at night).
half3 MM_ShadowFloor(half3 color, half3 albedo, half floorAmount)
{
    return max(color, albedo * floorAmount * (0.35h + 0.65h * _MM_DayLight));
}

#endif
