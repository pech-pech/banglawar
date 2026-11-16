using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>The one wiring call from SliceAssembler: truck FX, tyre tracks, emitters, the living world and the review probe.</summary>
    public static class FxInstaller
    {
        public sealed class Result { public TruckFx fx; public TyreTracks tracks; public TruckEmissives emissives; public LivingWorld world; }

        public static Result Install(Transform world, TruckView truck, RoadBuilder road, Camera cam, SimDriver sim)
        {
            FxToggles.ApplyCommandLine();
            var r = new Result();
            var root = new GameObject("FX").transform;
            root.SetParent(world, false);
            if (truck != null)
            {
                r.fx = root.gameObject.AddComponent<TruckFx>();
                r.fx.Init(truck.transform, sim);
                var tracksGo = new GameObject("FX_TyreTracks");
                tracksGo.transform.SetParent(root, false);
                r.tracks = tracksGo.AddComponent<TyreTracks>();
                r.tracks.Init(truck.transform, sim, road);
                r.emissives = root.gameObject.AddComponent<TruckEmissives>();
                r.emissives.Init(truck.transform);
            }
            r.world = root.gameObject.AddComponent<LivingWorld>();
            r.world.Init(world, road, cam);
            if (FxProbe.Requested) root.gameObject.AddComponent<FxProbe>().Bind(r, sim);
            return r;
        }
    }
}
