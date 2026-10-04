using Conquest.Presentation;
using Conquest.Unity.Art;
using UnityEngine;
using IsoProjection = Conquest.Presentation.IsoProjection;

namespace Conquest.UnityView
{
    /// <summary>
    /// One unit's banner. Idle it is the clay banner (the stateless picture u.role@slot: cloth, beam, ground mark);
    /// selected it cross-fades (<see cref="BannerTransition"/>) to the hologram the <see cref="SelectionLook"/> names.
    /// Size and float come from <see cref="BannerSizing"/>: the whole banner scales by its class, and only the beam is
    /// stretched (a sliced sprite) so the cloth floats higher while the ground mark stays on the tile. A move clip
    /// replaces the clay while a move cue runs. The view never reads game rules; it only shows what it is told.
    /// </summary>
    public sealed class BannerView : MonoBehaviour
    {
        private ArtLibrary art = null!;
        private SpriteRenderer clay = null!;
        private SpriteRenderer holo = null!;
        private SpriteRenderer shadow = null!;
        private SpriteRenderer beam = null!;
        private BannerPicture? clayPicture;
        private BannerPicture? holoPicture;
        private ArtClip holoClip;
        private bool hasHoloClip;
        private ArtClip moveClip;
        private bool hasMove;
        private double moveStart;
        private BannerTransition transition = BannerTransition.Settled(BannerVisualState.Clay);
        private BannerVisualState visual = BannerVisualState.Clay;
        private float phase;
        private float alpha = 1f;
        private BannerSizing sizing = BannerSizing.For(PolishChoice.C1);
        private SelectionLook look = SelectionLook.For(PolishChoice.C1);
        private int extraBeamPx;
        private int slotScalePermille = 1000;

        public int UnitId { get; private set; }

        public int Owner { get; private set; }

        public string Role { get; private set; } = string.Empty;

        public string Slot { get; private set; } = "f1";

        public BannerSizeClass SizeClass { get; private set; }

        /// <summary>The tile the banner stands on in the state it last matched.</summary>
        public GridPos Tile { get; private set; }

        public int StackIndex { get; private set; }

        public int StackSize { get; private set; } = 1;

        /// <summary>0 = front of its stack.</summary>
        public int StackDepth { get; private set; }

        /// <summary>Hidden behind its stack's lead (counted by the stack badge instead).</summary>
        public bool Hidden { get; private set; }

        /// <summary>Set while a move or fade cue owns the banner: reconcile leaves its position alone.</summary>
        public bool Busy { get; set; }

        public bool Dying { get; set; }

        /// <summary>How much of the hologram look is showing, 0 (clay) to 1000 (hologram).</summary>
        public int BlendPermille { get; private set; }

        public BannerVisualState Visual => visual;

        public bool UsingArt => clayPicture != null;

        public int SortKey { get; private set; }

        /// <summary>Total scale applied to the art: class scale times the stack slot's scale (permille).</summary>
        public int ScalePermille => sizing.ScalePermille(SizeClass) * slotScalePermille / 1000;

        /// <summary>Art pixels of the picture as drawn now (before scale): cloth, beam with the stretch, total.</summary>
        public int ClothArtPx => clayPicture?.ClothPx ?? PlaceholderDisc;

        public int BeamArtPx => (clayPicture?.DrawnBeamPx ?? PlaceholderLift) + extraBeamPx;

        public int WidthArtPx => clayPicture?.Width ?? PlaceholderDisc;

        public int ExtraBeamArtPx => extraBeamPx;

        private const int PlaceholderDisc = 64;
        private const int PlaceholderLift = 40;

        public static BannerView Create(Transform parent, ArtLibrary art, int unitId, int owner, string role, string slot)
        {
            var go = new GameObject("Banner u" + unitId + " " + role + "@" + slot);
            go.transform.SetParent(parent, false);
            var view = go.AddComponent<BannerView>();
            view.Init(art, unitId, owner, role, slot);
            return view;
        }

        private void Init(ArtLibrary library, int unitId, int owner, string role, string slot)
        {
            art = library;
            UnitId = unitId;
            Owner = owner;
            Role = role;
            Slot = slot;
            SizeClass = BannerSizeClasses.Of(role);
            phase = (unitId * 0.37f) % 1f;
            shadow = AddRenderer("Shadow", null);
            beam = AddRenderer("Beam", null);
            clay = AddRenderer("Body_Clay", null);
            holo = AddRenderer("Body_Holo", null);
            if (art.TryGet("u", role, null, slot, out ArtClip clayClip) && clayClip.Entry.State == null) clayPicture = art.Banners.Get(clayClip.Frame(0));
            if (clayPicture == null)
            {
                clay.sprite = art.Placeholders.Disc(OwnerColor(owner), Color.black, PlaceholderDisc);
                shadow.sprite = art.Placeholders.Shadow();
                beam.sprite = art.Placeholders.Beam(new Color(0.85f, 0.85f, 0.8f, 0.7f), 6, PlaceholderLift);
            }

            holo.color = new Color(1f, 1f, 1f, 0f);
            Configure(sizing, look);
        }

        private SpriteRenderer AddRenderer(string childName, Sprite? sprite)
        {
            var child = new GameObject(childName);
            child.transform.SetParent(transform, false);
            var r = child.AddComponent<SpriteRenderer>();
            r.sprite = sprite;
            return r;
        }

        private static Color OwnerColor(int owner) => owner == 0 ? new Color(0.2f, 0.55f, 0.35f) : new Color(0.3f, 0.35f, 0.6f);

        /// <summary>Applies a size candidate and a selection look: scale, beam stretch, and which hologram picture.</summary>
        public void Configure(BannerSizing newSizing, SelectionLook newLook)
        {
            sizing = newSizing;
            look = newLook;
            extraBeamPx = clayPicture != null && clayPicture.CanStretch ? sizing.ExtraBeamPx(clayPicture.ClothPx, clayPicture.DrawnBeamPx) : 0;
            holoPicture = null;
            hasHoloClip = false;
            holo.sprite = null;
            if (art.TryGet("u", Role, look.HologramState, Slot, out ArtClip clip) && clip.Entry.State == look.HologramState)
            {
                if (clip.FrameCount == 1 && look.HologramState == "selected") holoPicture = art.Banners.Get(clip.Frame(0));
                else
                {
                    holoClip = clip;
                    hasHoloClip = true;
                }
            }
            else
            {
                holo.sprite = art.Placeholders.Disc(new Color(0.55f, 0.95f, 1f, 0.7f), Color.white, 80);
            }

            Lay(clay, clayPicture, true);
            if (holoPicture != null) Lay(holo, holoPicture, true);
            else
            {
                holo.drawMode = SpriteDrawMode.Simple;
                holo.transform.localPosition = hasHoloClip ? Vector3.zero : new Vector3(0f, (PlaceholderLift + extraBeamPx) / (float)art.PixelsPerUnit, 0f);
            }

            if (clayPicture == null)
            {
                clay.transform.localPosition = new Vector3(0f, (PlaceholderLift + PlaceholderDisc / 2f) / art.PixelsPerUnit, 0f);
                beam.drawMode = SpriteDrawMode.Simple;
            }

            ApplyScale();
        }

        /// <summary>Puts a picture's ground point at the banner's origin and stretches its beam by the extra length.</summary>
        private void Lay(SpriteRenderer target, BannerPicture? picture, bool stretch)
        {
            if (picture == null) return;
            target.sprite = picture.Sprite;
            float ppu = art.PixelsPerUnit;
            if (stretch && picture.CanStretch && extraBeamPx > 0)
            {
                target.drawMode = SpriteDrawMode.Sliced;
                target.size = new Vector2(picture.Width / ppu, (picture.Height + extraBeamPx) / ppu);
            }
            else
            {
                target.drawMode = SpriteDrawMode.Simple;
            }

            target.transform.localPosition = new Vector3(0f, -picture.GroundFromBottomPx / ppu, 0f);
        }

        private void ApplyScale()
        {
            float s = ScalePermille / 1000f;
            transform.localScale = new Vector3(s, s, 1f);
        }

        /// <summary>Places the banner on a tile in a stack slot.</summary>
        public void Place(GridPos tile, StackSlot slot, int stackIndex, int stackSize, IsoProjection iso)
        {
            Tile = tile;
            StackIndex = stackIndex;
            StackSize = stackSize;
            StackDepth = slot.Depth;
            Hidden = !slot.Visible;
            slotScalePermille = slot.ScalePermille;
            PixelPoint centre = iso.GridToWorld(tile);
            transform.position = ViewSpace.ToWorld(centre, new PixelPoint(slot.OffsetX, slot.OffsetY), art.PixelsPerUnit);
            ApplyScale();
            SortKey = Presentation.SortKey.ForStackedUnit(tile, StackDepth, false);
            ApplySort();
        }

        /// <summary>Puts the banner at an arbitrary world pixel while it walks, alone and in front.</summary>
        public void PlaceAt(PixelPoint worldPixel, GridPos from, GridPos to, int progressPermille)
        {
            transform.position = ViewSpace.ToWorld(worldPixel, art.PixelsPerUnit);
            Hidden = false;
            slotScalePermille = 1000;
            StackDepth = 0;
            ApplyScale();
            SortKey = Presentation.SortKey.ForStackedUnit(progressPermille >= 500 ? to : from, 0, false);
            ApplySort();
        }

        private void ApplySort()
        {
            shadow.sortingOrder = SortKey - 1;
            beam.sortingOrder = SortKey;
            clay.sortingOrder = SortKey;
            holo.sortingOrder = SortKey + 1;
        }

        public void SetVisual(BannerVisualState next, int nowMs)
        {
            if (next == visual) return;
            visual = next;
            transition = transition.Begin(next, nowMs);
        }

        public void SetAlpha(float value) => alpha = value;

        public void BeginMove(ArtClip clip, bool available, double nowSeconds)
        {
            moveClip = clip;
            hasMove = available;
            moveStart = nowSeconds;
        }

        public void EndMove()
        {
            hasMove = false;
            Lay(clay, clayPicture, true);
        }

        public bool UsingMoveClip => hasMove;

        /// <summary>Drives the loops and the cross-fade. Called every frame by the layer with presentation time.</summary>
        public void Tick(double nowSeconds, int nowMs)
        {
            int blend = transition.BlendPermille(nowMs);
            int fromHolo = BannerVisualRules.IsHologram(transition.From) ? 1000 : 0;
            int toHolo = BannerVisualRules.IsHologram(transition.To) ? 1000 : 0;
            BlendPermille = fromHolo + (toHolo - fromHolo) * blend / 1000;
            float holoAmount = hasMove ? 0f : BlendPermille / 1000f;
            float shown = Hidden ? 0f : alpha;
            if (hasMove)
            {
                clay.drawMode = SpriteDrawMode.Simple;
                clay.sprite = moveClip.FrameAt(nowSeconds - moveStart);
                clay.transform.localPosition = Vector3.zero;
            }

            if (hasHoloClip && holoAmount > 0f) holo.sprite = holoClip.FrameAt(nowSeconds + phase);
            // the "selected" picture repeats the clay banner, so the clay can fade out under it; a glyph-only hologram replaces it
            float clayAmount = holoPicture != null ? 1f - holoAmount : 1f - holoAmount;
            clay.color = new Color(1f, 1f, 1f, clayAmount * shown);
            holo.color = new Color(1f, 1f, 1f, holoAmount * shown);
            shadow.color = new Color(1f, 1f, 1f, shown);
            beam.color = new Color(1f, 1f, 1f, shown);
            bool placeholder = clayPicture == null;
            shadow.enabled = placeholder;
            beam.enabled = placeholder;
        }

        /// <summary>World position of a top corner of the cloth (badges sit there): right when <paramref name="right"/>, else left.</summary>
        public Vector3 ClothTopCornerWorld(bool right)
        {
            float ppu = art.PixelsPerUnit;
            float s = ScalePermille / 1000f;
            float top = (BeamArtPx + ClothArtPx) * s / ppu;
            float side = WidthArtPx * 0.5f * s / ppu;
            return transform.position + new Vector3(right ? side : -side, top, 0f);
        }

        /// <summary>The cloth's rectangle on screen in model pixels (top-left origin): what a click or tap aims at.</summary>
        public PixelRect ScreenRect(Camera camera, int viewportHeight)
        {
            float ppu = art.PixelsPerUnit;
            float s = ScalePermille / 1000f;
            float bottom = BeamArtPx * s / ppu;
            float top = (BeamArtPx + ClothArtPx) * s / ppu;
            float half = WidthArtPx * 0.5f * s / ppu;
            Vector3 p = transform.position;
            Vector3 lo = camera.WorldToScreenPoint(p + new Vector3(-half, bottom, 0f));
            Vector3 hi = camera.WorldToScreenPoint(p + new Vector3(half, top, 0f));
            int left = Mathf.FloorToInt(Mathf.Min(lo.x, hi.x));
            int right = Mathf.CeilToInt(Mathf.Max(lo.x, hi.x));
            int topPx = viewportHeight - Mathf.CeilToInt(Mathf.Max(lo.y, hi.y));
            int bottomPx = viewportHeight - Mathf.FloorToInt(Mathf.Min(lo.y, hi.y));
            return new PixelRect(left, topPx, right, bottomPx);
        }

        /// <summary>Renderers of this banner, for layering and measurement tools.</summary>
        public SpriteRenderer ClayRenderer => clay;

        public SpriteRenderer HologramRenderer => holo;
    }
}
