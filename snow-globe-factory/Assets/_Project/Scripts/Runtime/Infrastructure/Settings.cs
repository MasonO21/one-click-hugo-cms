using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>Accessibility and comfort options, persisted in PlayerPrefs.</summary>
    public static class Settings
    {
        public static bool Subtitles = true;
        public static float CameraShake = 1f;
        public static bool ReducedFlicker;
        public static float MouseSensitivity = 2f;
        public static float MusicVolume = 0.5f;

        public static void Load()
        {
            Subtitles = PlayerPrefs.GetInt("sgf.subtitles", 1) == 1;
            CameraShake = PlayerPrefs.GetFloat("sgf.shake", 1f);
            ReducedFlicker = PlayerPrefs.GetInt("sgf.reducedFlicker", 0) == 1;
            MouseSensitivity = PlayerPrefs.GetFloat("sgf.mouse", 2f);
            MusicVolume = PlayerPrefs.GetFloat("sgf.music", 0.5f);
        }

        public static void Save()
        {
            PlayerPrefs.SetInt("sgf.subtitles", Subtitles ? 1 : 0);
            PlayerPrefs.SetFloat("sgf.shake", CameraShake);
            PlayerPrefs.SetInt("sgf.reducedFlicker", ReducedFlicker ? 1 : 0);
            PlayerPrefs.SetFloat("sgf.mouse", MouseSensitivity);
            PlayerPrefs.SetFloat("sgf.music", MusicVolume);
            PlayerPrefs.Save();
        }
    }
}
