using System;

namespace Conquest.Core.Contracts
{
    /// <summary>The six fixed resources of a base (GDD 2.1). Pop is the people count (<c>res.pop</c>).</summary>
    public readonly struct ResourceVector : IEquatable<ResourceVector>
    {
        public ResourceVector(int basic, int hard, int coin, int wares, int food, int pop)
        {
            Basic = basic;
            Hard = hard;
            Coin = coin;
            Wares = wares;
            Food = food;
            Pop = pop;
        }

        public int Basic { get; }

        public int Hard { get; }

        public int Coin { get; }

        public int Wares { get; }

        public int Food { get; }

        public int Pop { get; }

        public static ResourceVector Zero => default;

        public int Get(Resource r)
        {
            switch (r)
            {
                case Resource.Basic: return Basic;
                case Resource.Hard: return Hard;
                case Resource.Coin: return Coin;
                case Resource.Wares: return Wares;
                case Resource.Food: return Food;
                default: return Pop;
            }
        }

        public ResourceVector With(Resource r, int value)
        {
            switch (r)
            {
                case Resource.Basic: return new ResourceVector(value, Hard, Coin, Wares, Food, Pop);
                case Resource.Hard: return new ResourceVector(Basic, value, Coin, Wares, Food, Pop);
                case Resource.Coin: return new ResourceVector(Basic, Hard, value, Wares, Food, Pop);
                case Resource.Wares: return new ResourceVector(Basic, Hard, Coin, value, Food, Pop);
                case Resource.Food: return new ResourceVector(Basic, Hard, Coin, Wares, value, Pop);
                default: return new ResourceVector(Basic, Hard, Coin, Wares, Food, value);
            }
        }

        public ResourceVector Add(ResourceVector o) =>
            new ResourceVector(checked(Basic + o.Basic), checked(Hard + o.Hard), checked(Coin + o.Coin), checked(Wares + o.Wares), checked(Food + o.Food), checked(Pop + o.Pop));

        public ResourceVector Subtract(ResourceVector o) =>
            new ResourceVector(checked(Basic - o.Basic), checked(Hard - o.Hard), checked(Coin - o.Coin), checked(Wares - o.Wares), checked(Food - o.Food), checked(Pop - o.Pop));

        /// <summary>True when every component of this vector is at least the matching component of <paramref name="cost"/>.</summary>
        public bool Covers(ResourceVector cost) =>
            Basic >= cost.Basic && Hard >= cost.Hard && Coin >= cost.Coin && Wares >= cost.Wares && Food >= cost.Food && Pop >= cost.Pop;

        public bool Equals(ResourceVector o) =>
            Basic == o.Basic && Hard == o.Hard && Coin == o.Coin && Wares == o.Wares && Food == o.Food && Pop == o.Pop;

        public override bool Equals(object? obj) => obj is ResourceVector o && Equals(o);

        public override int GetHashCode() => unchecked((((((Basic * 31) + Hard) * 31 + Coin) * 31 + Wares) * 31 + Food) * 31 + Pop);

        public override string ToString() => "[" + Basic + "," + Hard + "," + Coin + "," + Wares + "," + Food + "," + Pop + "]";
    }
}
