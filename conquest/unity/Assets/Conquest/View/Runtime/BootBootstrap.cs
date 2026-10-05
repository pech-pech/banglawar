using Conquest.Glue;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Conquest.UnityView
{
    /// <summary>
    /// The Boot scene's only component: loads the data files and builds the session (GameApp), then loads the Map
    /// scene on top of it. No gameplay object lives in Boot. A load error is logged once and stops the boot.
    /// </summary>
    public sealed class BootBootstrap : MonoBehaviour
    {
        public const string MapSceneName = "Map";
        public const string BootSceneName = "Boot";

        [SerializeField] private bool loadMapScene = true;

        public bool Failed { get; private set; }

        public string? Error { get; private set; }

        private void Start()
        {
            try
            {
                GameApp.Reset();
                GameApp.StartNewGame();
            }
            catch (System.Exception e) when (e is ContentLoadException || e is System.IO.IOException || e is System.FormatException)
            {
                Failed = true;
                Error = e.Message;
                Debug.LogError("Boot failed: " + e.Message);
                return;
            }

            if (loadMapScene) SceneManager.LoadSceneAsync(MapSceneName, LoadSceneMode.Additive);
        }
    }
}
