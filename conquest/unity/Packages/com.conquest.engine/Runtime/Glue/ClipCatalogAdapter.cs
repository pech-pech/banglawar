using System;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;
using Conquest.Presentation;

namespace Conquest.Glue
{
    /// <summary>
    /// SWAP SPOT 4. <see cref="IClipCatalog"/> over the asset manifest. The director asks for the states walk, idle,
    /// attack, down, construct and built; the pilot manifest names them move_ne/se/sw/nw, idle, act, destroyed and
    /// build (design question O-5). This table is the only place that knows both vocabularies. The director passes the
    /// render direction (a mirrored SW/W/NW arrives as SE/E/NE), so the view re-resolves the walk clip per step from
    /// the true facing with <see cref="WalkState"/>.
    /// </summary>
    public sealed class ClipCatalogAdapter : IClipCatalog
    {
        private readonly AssetCatalog catalog;

        public ClipCatalogAdapter(AssetCatalog catalog)
        {
            this.catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        }

        /// <summary>Manifest state for the four-way walk art: N and NE use move_ne, E and SE move_se, S and SW move_sw, W and NW move_nw.</summary>
        public static string WalkState(Facing facing)
        {
            switch (FacingMath.ToFourWay(facing))
            {
                case Facing.NE: return "move_ne";
                case Facing.SW: return "move_sw";
                case Facing.NW: return "move_nw";
                default: return "move_se";
            }
        }

        public static string ManifestState(string? state, Facing direction)
        {
            switch (state)
            {
                case AnimationDirector.StateWalk: return WalkState(direction);
                case AnimationDirector.StateAttack: return "act";
                case AnimationDirector.StateDown: return "destroyed";
                case AnimationDirector.StateConstruct:
                case AnimationDirector.StateBuilt: return "build";
                default: return state ?? string.Empty;
            }
        }

        public ClipInfo? Find(string kind, string role, string? state, string? slot, Facing renderDirection)
        {
            string wanted = ManifestState(state, renderDirection);
            Resolution? hit = catalog.Resolve(new AssetRequest(kind, role, state: wanted, slot: slot));
            if (hit == null) return null;
            SheetEntry e = hit.Entry;
            bool sameState = string.Equals(e.State, string.IsNullOrEmpty(wanted) ? null : wanted, StringComparison.Ordinal);
            return new ClipInfo(e.Key, sameState ? state : e.State, e.FrameCount, e.Fps ?? 0, e.Loop);
        }
    }
}
