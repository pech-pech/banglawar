# F04 9-slice notes (insets in px, source = 2752x1536 2K raw, no rescaling)
Files: F04-button-9slice.png (436x376), F04-panel-9slice.png (676x676). Both built from the trimmed plates by
keeping the four corners/edges and collapsing the centre to a 16 px strip (so stretch it, do not tile).
| File | Left | Top | Right | Bottom | Min size | Centre strip |
|---|---|---|---|---|---|---|
| F04-button-9slice.png | 210 | 180 | 210 | 180 | 436x376 | 16x16 |
| F04-panel-9slice.png | 330 | 330 | 330 | 330 | 676x676 | 16x16 |
Godot NinePatchRect patch_margin_left/top/right/bottom = the numbers above. Scale the node down in game (these are large).
Notes: the 180 vs 210 split on the button keeps the small second glint dot out of the stretch zone. Panel insets are large because
the inner lighter rectangle has its own rounded corners that must stay in the corner patches. Vertical gradient shows faint banding
when the panel is stretched tall (stretch tests viewed). Full unstretched plates: F04-plate-button-a/b.png, F04-plate-panel.png.
