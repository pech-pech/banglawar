// Polyfill so C# 9 records and init-only setters compile on netstandard2.1 (Unity 6 and dotnet).
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit
    {
    }
}
