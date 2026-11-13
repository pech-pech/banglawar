namespace MixerMad.Game
{
    /// <summary>
    /// A simple driver for review runs (stills, searches). In the air it keeps the nose inside a band using the
    /// sim's air torque (gas = nose up, brake = nose down); on the ground it holds gas up to a speed cap and lets
    /// off when the nose climbs too far. Pure: reads a snapshot, returns an input.
    /// </summary>
    public readonly struct StillsBot
    {
        public readonly float airNoseDown, airNoseUp, groundNoseUp, speedCap;

        public StillsBot(float airNoseDown, float airNoseUp, float groundNoseUp, float speedCap)
        { this.airNoseDown = airNoseDown; this.airNoseUp = airNoseUp; this.groundNoseUp = groundNoseUp; this.speedCap = speedCap; }

        public SimInput Drive(SimSnapshot s)
        {
            if (s == null) return new SimInput { gas = 1f };
            if (!s.grounded)
            {
                if (s.chassisAngle > airNoseUp) return new SimInput { brake = 1f };
                if (s.chassisAngle < airNoseDown) return new SimInput { gas = 1f };
                return SimInput.None;
            }
            if (s.chassisAngle > groundNoseUp) return SimInput.None;
            return new SimInput { gas = s.speed > speedCap ? 0.4f : 1f };
        }

        public override string ToString() => $"air {airNoseDown:F2}..{airNoseUp:F2} ground<{groundNoseUp:F2} cap {speedCap:F0}";
    }
}
