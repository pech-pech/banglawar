// MixerMad/SnowIce
// Road, snow banks, ice and rock walls in one material, driven by vertex colour from RoadBuilder:
//   R = snow cover (0 bare road .. 1 deep snow)   G = ice (frozen lake)   B = cliff wall   A = baked shade (1 = none)
// Global values (set by Weather): _MM_Wetness darkens + glosses the road, _MM_Snow dusts up-facing surfaces.
// Frozen lake mirrors the world through the planar reflection texture when _MM_PLANAR is on (High/Ultra),
// otherwise it falls back to the reflection probe via high smoothness (Low/Medium).
Shader "MixerMad/SnowIce"
{
    Properties
    {
        _RoadColor ("Road", Color) = (0.42, 0.43, 0.46, 1)
        _SnowColor ("Snow", Color) = (0.85, 0.87, 0.92, 1)       // P2 polish: about 0.85, under the clip point (L-MM-28)
        _ShadeColor ("Snow Shade", Color) = (0.64, 0.73, 0.86, 1)
        _IceColor ("Ice", Color) = (0.62, 0.84, 0.96, 1)
        _WallColor ("Rock Wall", Color) = (0.60, 0.46, 0.33, 1)
        _LipColor ("Top Lip", Color) = (0.91, 0.878, 0.8, 1)
        _SnowSmoothness ("Snow Smoothness", Range(0,1)) = 0.22
        _RoadSmoothness ("Road Smoothness", Range(0,1)) = 0.25
        _IceSmoothness ("Ice Smoothness", Range(0,1)) = 0.93
        _SparkleStrength ("Sparkle", Range(0,3)) = 1.2
        _SparkleScale ("Sparkle Scale", Range(10,200)) = 90
        _GrainNormal ("Snow Grain Normal", Range(0,0.5)) = 0.12
        _PlanarStrength ("Planar Mirror Strength", Range(0,1)) = 0.75
        _ShadowFloor ("Min Shadow Brightness", Range(0,0.6)) = 0.28
        _RimColor ("Rim", Color) = (0.8, 0.9, 1, 1)
        _RimStrength ("Rim Strength", Range(0,1)) = 0.12
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" "UniversalMaterialType" = "Lit" }
        LOD 300

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

        CBUFFER_START(UnityPerMaterial)
            half4 _RoadColor;
            half4 _SnowColor;
            half4 _ShadeColor;
            half4 _IceColor;
            half4 _WallColor;
            half4 _LipColor;
            half4 _RimColor;
            half _SnowSmoothness;
            half _RoadSmoothness;
            half _IceSmoothness;
            half _SparkleStrength;
            half _SparkleScale;
            half _GrainNormal;
            half _PlanarStrength;
            half _ShadowFloor;
            half _RimStrength;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull Back ZWrite On ZTest LEqual

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fog
            #pragma multi_compile _ _MM_PLANAR
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #define MM_USE_LIGHTING
            #include "ToyCommon.hlsl"

            TEXTURE2D(_MM_PlanarTex); SAMPLER(sampler_MM_PlanarTex);

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                half3 normalWS : TEXCOORD2;
                half4 fogAndVertexLight : TEXCOORD3;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings vert(Attributes IN)
            {
                Varyings OUT = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_TRANSFER_INSTANCE_ID(IN, OUT);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);
                VertexPositionInputs vpi = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = vpi.positionCS;
                OUT.positionWS = vpi.positionWS;
                OUT.normalWS = TransformObjectToWorldNormal(IN.normalOS);
                OUT.color = IN.color;
                OUT.uv = IN.uv;
                half3 vl = 0;
                #ifdef _ADDITIONAL_LIGHTS_VERTEX
                    vl = VertexLighting(vpi.positionWS, OUT.normalWS);
                #endif
                OUT.fogAndVertexLight = half4(ComputeFogFactor(vpi.positionCS.z), vl);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(IN);
                MM_REFLECTION_CLIP(IN.positionWS);

                half snowVC = IN.color.r, iceVC = IN.color.g, wallVC = IN.color.b;
                float2 wxy = IN.positionWS.xy;

                half3 N = normalize(IN.normalWS);
                half up = saturate(N.y);

                // grain: micro bumps on snow so the highlights sparkle instead of sliding flat
                float g1 = MM_VNoise(IN.positionWS.xz * 6.0 + IN.positionWS.y * 2.0);
                float g2 = MM_VNoise(IN.positionWS.xz * 17.0 - IN.positionWS.y * 3.0);
                half3 grainN = normalize(half3((g1 - 0.5) * 2, 0, (g2 - 0.5) * 2));

                // snow mask: authored cover + dusting that grows with weather on up-facing faces
                half dust = saturate(_MM_Snow * smoothstep(0.35, 0.9, up));
                half snow = saturate(max(snowVC, dust)) * (1 - iceVC);
                snow = max(snow, wallVC * smoothstep(0.55, 0.85, up) * saturate(0.55 + _MM_Snow));   // snow cap on cliffs

                N = normalize(N + grainN * _GrainNormal * snow);

                half3 shadeMix = lerp(_ShadeColor.rgb, _SnowColor.rgb, saturate(up * 0.8 + 0.25));
                half3 baseRoad = lerp(_RoadColor.rgb, _WallColor.rgb, wallVC);
                // a lighter lip where road meets snow
                half lip = smoothstep(0.55, 0.9, snowVC) * (1 - smoothstep(0.9, 1.0, snowVC));
                half3 albedo = lerp(baseRoad, shadeMix, snow);
                albedo = lerp(albedo, _LipColor.rgb, lip * 0.5);
                albedo = lerp(albedo, _IceColor.rgb, iceVC);
                albedo *= IN.color.a;   // A = baked shade from RoadBuilder (cut-face AO, strata, gradient); 1 everywhere else

                half wet = _MM_Wetness * (1 - snow);
                albedo *= 1 - wet * 0.35 * (1 - iceVC);
                half smoothness = lerp(lerp(_RoadSmoothness, _SnowSmoothness, snow), _IceSmoothness, iceVC);
                smoothness = saturate(smoothness + wet * 0.55);

                SurfaceData sd = (SurfaceData)0;
                sd.albedo = albedo;
                sd.alpha = 1;
                sd.smoothness = smoothness;
                sd.occlusion = 1;
                sd.normalTS = half3(0, 0, 1);

                // sparkle: sparse bright cells that twinkle with the view angle
                half3 V = GetWorldSpaceNormalizeViewDir(IN.positionWS);
                float2 cell = floor(IN.positionWS.xy * _SparkleScale + IN.positionWS.z * 7.0);
                float h = MM_Hash21(cell);
                float tw = 0.5 + 0.5 * sin(_Time.y * 2.2 + h * 40.0 + dot(V, N) * 9.0);
                half sparkle = step(0.985, h) * tw * (snow + iceVC) * _SparkleStrength;
                sd.emission = half3(sparkle, sparkle, sparkle) * _MM_DayLight;

                InputData id = (InputData)0;
                id.positionWS = IN.positionWS;
                id.positionCS = IN.positionCS;
                id.normalWS = N;
                id.viewDirectionWS = V;
                #if defined(MAIN_LIGHT_CALCULATE_SHADOWS)
                    id.shadowCoord = TransformWorldToShadowCoord(IN.positionWS);
                #else
                    id.shadowCoord = float4(0, 0, 0, 0);
                #endif
                id.fogCoord = InitializeInputDataFog(float4(IN.positionWS, 1.0), IN.fogAndVertexLight.x);
                id.vertexLighting = IN.fogAndVertexLight.yzw;
                id.bakedGI = SampleSH(N);
                id.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(IN.positionCS);
                id.shadowMask = half4(1, 1, 1, 1);

                half4 color = UniversalFragmentPBR(id, sd);

                Light mainLight = GetMainLight(id.shadowCoord, IN.positionWS, id.shadowMask);
                color.rgb += MM_Rim(N, V, mainLight, _RimColor.rgb, _RimStrength * snow, 3.0h);

                #if defined(_MM_PLANAR)
                    // Mirror of the world on ice and (a bit) on wet road. Ripples = noisy UV offset.
                    float2 suv = id.normalizedScreenSpaceUV;
                    float2 wob = (float2(MM_VNoise(IN.positionWS.xz * 3.0 + _Time.y * 0.4), MM_VNoise(IN.positionWS.xz * 3.0 - _Time.y * 0.3 + 7.0)) - 0.5) * 0.012;
                    half3 refl = SAMPLE_TEXTURE2D(_MM_PlanarTex, sampler_MM_PlanarTex, suv + wob).rgb;
                    half fres = 0.25h + 0.75h * pow(1.0h - saturate(dot(N, V)), 3.0h);
                    half mirror = saturate(iceVC + wet * 0.5h) * _PlanarStrength * fres;
                    color.rgb = lerp(color.rgb, refl, mirror);
                #endif

                color.rgb = MM_ShadowFloor(color.rgb, albedo, _ShadowFloor);
                color.rgb = MixFog(color.rgb, id.fogCoord);
                color.a = 1;
                return color;
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0 Cull Back

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vertShadow
            #pragma fragment fragShadow
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            float3 _LightDirection;
            float3 _LightPosition;

            struct AttributesS { float4 positionOS : POSITION; float3 normalOS : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct VaryingsS { float4 positionCS : SV_POSITION; };

            VaryingsS vertShadow(AttributesS IN)
            {
                VaryingsS OUT;
                UNITY_SETUP_INSTANCE_ID(IN);
                float3 positionWS = TransformObjectToWorld(IN.positionOS.xyz);
                float3 normalWS = TransformObjectToWorldNormal(IN.normalOS);
                #if _CASTING_PUNCTUAL_LIGHT_SHADOW
                    float3 lightDirectionWS = normalize(_LightPosition - positionWS);
                #else
                    float3 lightDirectionWS = _LightDirection;
                #endif
                float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, lightDirectionWS));
                #if UNITY_REVERSED_Z
                    positionCS.z = min(positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    positionCS.z = max(positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                OUT.positionCS = positionCS;
                return OUT;
            }
            half4 fragShadow(VaryingsS IN) : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R Cull Back

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vertDepth
            #pragma fragment fragDepth
            #pragma multi_compile_instancing

            struct AttributesD { float4 positionOS : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct VaryingsD { float4 positionCS : SV_POSITION; };

            VaryingsD vertDepth(AttributesD IN)
            {
                VaryingsD OUT;
                UNITY_SETUP_INSTANCE_ID(IN);
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                return OUT;
            }
            half fragDepth(VaryingsD IN) : SV_Target { return IN.positionCS.z; }
            ENDHLSL
        }
    }
    FallBack Off
}
