using System.IO;
using Conquest.Presentation;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Chooses where saves live: a "saves" folder under <see cref="Application.persistentDataPath"/>, then one under the
    /// temporary cache folder, then memory, so a player whose disk refuses writes can still save and load during the
    /// session. A batch-mode run (tests, tools) uses memory unless a test supplies a folder, so automated runs never
    /// touch a real player's saves or settings.
    /// </summary>
    public static class SaveStorageFactory
    {
        public const string FolderName = "saves";

        /// <summary>Set by a test to force a storage; null for the normal choice.</summary>
        public static ISaveStorage? Override { get; set; }

        public static ISaveStorage Create()
        {
            if (Override != null) return Override;
            if (Application.isBatchMode) return new MemorySaveStorage();
            return Chain(Application.persistentDataPath, Application.temporaryCachePath);
        }

        /// <summary>The folder chain for two base folders (either may be empty or unusable); memory is always the last link.</summary>
        public static ISaveStorage Chain(string? primaryBase, string? secondaryBase)
        {
            var links = new System.Collections.Generic.List<ISaveStorage>();
            if (!string.IsNullOrEmpty(primaryBase)) links.Add(new DirectorySaveStorage(Path.Combine(primaryBase!, FolderName)));
            if (!string.IsNullOrEmpty(secondaryBase)) links.Add(new DirectorySaveStorage(Path.Combine(secondaryBase!, FolderName)));
            links.Add(new MemorySaveStorage());
            return new FallbackSaveStorage(links.ToArray());
        }
    }
}
