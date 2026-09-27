using System;
using System.IO;
using SnowGlobe.Core;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// JSON saves via JsonUtility. GameState is designed to be JsonUtility-friendly
    /// (public fields, lists, no dictionaries). Loading always goes through
    /// SaveValidator.Repair (inside GameSession.Load).
    /// </summary>
    public sealed class SaveSystem : IGameStateSerializer
    {
        /// <summary>When set, saves go here instead of persistentDataPath (tests use it to keep the player's saves untouched).</summary>
        public static string DirectoryOverride;

        static string SaveDirectory { get { return DirectoryOverride ?? Application.persistentDataPath; } }

        public string SavePath { get { return Path.Combine(SaveDirectory, "snowglobe_save.json"); } }
        /// <summary>Written automatically at the start of every day; used for closure recovery.</summary>
        public string CheckpointPath { get { return Path.Combine(SaveDirectory, "snowglobe_checkpoint.json"); } }

        public string Serialize(GameState state) { return JsonUtility.ToJson(state, true); }

        public GameState Deserialize(string json) { return JsonUtility.FromJson<GameState>(json); }

        public bool Exists(string path) { return File.Exists(path); }

        public bool Save(GameState state, string path)
        {
            try
            {
                string tmp = path + ".tmp";
                File.WriteAllText(tmp, Serialize(state));
                if (File.Exists(path)) File.Delete(path);
                File.Move(tmp, path);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("[SnowGlobe] Save failed: " + e);
                return false;
            }
        }

        public GameState Load(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                var state = Deserialize(File.ReadAllText(path));
                if (state == null || state.Version > GameState.CurrentVersion) return null;
                return state;
            }
            catch (Exception e)
            {
                Debug.LogError("[SnowGlobe] Load failed: " + e);
                return null;
            }
        }
    }
}
