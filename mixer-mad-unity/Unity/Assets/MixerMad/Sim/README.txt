Copy /home/user/mm-unity/Sim/Core/*.cs here (flat) from the sim library. Keep MixerMad.Sim.asmdef (noEngineReferences: true).
Sim data JSON (tuning.json, levels.json, vehicles.json) goes to Assets/MixerMad/Resources/MixerMadSim/.
Only Runtime/Core/MixerSimBackend.cs knows the sim API.
