using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Drop this on an empty GameObject in an empty scene (or use the menu
    /// "Snow Globe Factory > Create Prototype Scene") and press Play. The whole
    /// prototype — building, player, stations, customers, UI, audio — is generated at runtime.
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        [Tooltip("Seed for the first session shown behind the title screen.")]
        public uint Seed = 1225;

        void Start()
        {
            // Remove default scene cameras/lights so the generated player camera and lighting own the view.
            foreach (var cam in FindObjectsByType<Camera>(FindObjectsSortMode.None)) Destroy(cam.gameObject);
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) if (l.type == LightType.Directional) Destroy(l.gameObject);
            gameObject.AddComponent<GameRoot>().Boot(Seed);
        }
    }
}
