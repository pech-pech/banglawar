// MixerMad/ToyPlastic
// Glossy toy: URP PBR base + clear-coat lobe + soft light rim + navy inverted-hull outline.
// Matte rubber = ClearCoat 0, Smoothness 0.25. Glass = _StreakStrength 1.
// SRP Batcher compatible: every material property is in UnityPerMaterial, identical in all passes.
// The outline is a second pass tagged SRPDefaultUnlit in the SAME shader, so one material does it all.
Shader "MixerMad/ToyPlastic"
{
    Properties
    {
        [MainColor] _BaseColor ("Base Color", Color) = (1, 0.76, 0.1, 1)
        [MainTexture] _BaseMap ("Albedo", 2D) = "white" {}
        _Smoothness ("Base Smoothness", Range(0,1)) = 0.55
        _Metallic ("Metallic", Range(0,1)) = 0
        _ClearCoat ("Clear Coat", Range(0,1)) = 1
        _ClearCoatSmoothness ("Clear Coat Smoothness", Range(0,1)) = 0.9
        [HDR] _EmissionColor ("Emission", Color) = (0,0,0,1)
        _StreakStrength ("Glass Streak", Range(0,1)) = 0
        _ShadowFloor ("Min Shadow Brightness", Range(0,0.6)) = 0.25
        [Header(Dual edge)] _RimColor ("Light Rim Colour", Color) = (0.86, 0.94, 1, 1)
        _RimStrength ("Rim Strength", Range(0,1.5)) = 0.45
        _RimPower ("Rim Power", Range(0.5,8)) = 3
        _OutlineColor ("Navy Outline", Color) = (0.133, 0.145, 0.169, 1)
        _OutlineWidth ("Outline Width (m)", Range(0,0.2)) = 0.06
        _OutlineMinPixels ("Outline Min Pixels", Range(0,6)) = 1.5
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" "UniversalMaterialType" = "Lit" }
        LOD 300

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);

        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half4 _BaseColor;
            half4 _EmissionColor;
            half4 _RimColor;
            half4 _OutlineColor;
            half _Smoothness;
            half _Metallic;
            half _ClearCoat;
            half _ClearCoatSmoothness;
            half _StreakStrength;
            half _ShadowFloor;
            half _RimStrength;
            half _RimPower;
            half _OutlineWidth;
            half _OutlineMinPixels;
        CBUFFER_END
        ENDHLSL

        // ------------------------------------------------------------------ main lit pass
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
            // Forward+ keyword in URP 17.6 (the old _FORWARD_PLUS is deprecated and only aliased).
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            #pragma instancing_options renderinglayer

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #define MM_USE_LIGHTING
            #include "ToyCommon.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                half3 normalWS : TEXCOORD2;
                half4 fogAndVertexLight : TEXCOORD3;
                float3 positionOS : TEXCOORD4;
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
                OUT.uv = TRANSFORM_TEX(IN.uv, _BaseMap);
                OUT.positionOS = IN.positionOS.xyz;
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

                half4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, IN.uv) * _BaseColor;

                // Painted streak for glass: two diagonal bands in object space.
                float band = IN.positionOS.x * 0.9 + IN.positionOS.y * 1.3;
                half streak = smoothstep(0.20, 0.10, abs(band - 0.2)) * 0.55 + smoothstep(0.05, 0.0, abs(band - 0.58)) * 0.8;
                half3 albedo = tex.rgb + streak * _StreakStrength;

                half3 N = normalize(IN.normalWS);
                half3 V = GetWorldSpaceNormalizeViewDir(IN.positionWS);

                SurfaceData sd = (SurfaceData)0;
                sd.albedo = albedo;
                sd.alpha = 1;
                sd.metallic = _Metallic;
                sd.specular = 0;
                sd.smoothness = saturate(_Smoothness + _MM_Wetness * 0.1h);
                sd.occlusion = 1;
                sd.normalTS = half3(0, 0, 1);
                sd.emission = _EmissionColor.rgb;

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
                color.rgb += MM_ClearCoat(N, V, mainLight, _ClearCoat, _ClearCoatSmoothness, 1.0h);
                color.rgb += MM_Rim(N, V, mainLight, _RimColor.rgb, _RimStrength, _RimPower);
                color.rgb = MM_ShadowFloor(color.rgb, albedo, _ShadowFloor);
                color.rgb = MixFog(color.rgb, id.fogCoord);
                color.a = 1;
                return color;
            }
            ENDHLSL
        }

        // ------------------------------------------------------------------ navy inverted-hull outline
        Pass
        {
            Name "Outline"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            Cull Front ZWrite On ZTest LEqual

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vertOutline
            #pragma fragment fragOutline
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            #include "ToyCommon.hlsl"

            struct AttributesO
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct VaryingsO
            {
                float4 positionCS : SV_POSITION;
                half fogFactor : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            VaryingsO vertOutline(AttributesO IN)
            {
                VaryingsO OUT = (VaryingsO)0;
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);
                float3 nOS = MM_DecodeSmoothNormalOS(IN.color, IN.normalOS);
                float3 posWS = TransformObjectToWorld(IN.positionOS.xyz);
                float3 nWS = TransformObjectToWorldNormal(nOS);
                posWS = MM_OutlineOffsetWS(posWS, nWS, _OutlineWidth, _OutlineMinPixels);
                OUT.positionCS = TransformWorldToHClip(posWS);
                OUT.fogFactor = ComputeFogFactor(OUT.positionCS.z);
                return OUT;
            }

            half4 fragOutline(VaryingsO IN) : SV_Target
            {
                half3 c = MixFog(_OutlineColor.rgb, IN.fogFactor);
                return half4(c, 1);
            }
            ENDHLSL
        }

        // ------------------------------------------------------------------ shadows & depth
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
