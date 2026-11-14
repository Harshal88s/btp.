// Editor helper: on first open, creates Assets/Scenes/Main.unity (camera + light only - the game builds
// everything else at runtime) and registers it in the build settings. Also adds a "Shehar" menu.
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Shehar.EditorTools
{
    [InitializeOnLoad]
    public static class SheharSetup
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        static SheharSetup()
        {
            EditorApplication.delayCall += () => Ensure(false);
        }

        [MenuItem("Shehar/Create or Open Main Scene", false, 1)]
        static void EnsureMenu() { Ensure(true); }

        static void Ensure(bool open)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            bool created = false;
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
                AssetDatabase.Refresh();
                created = true;
            }
            var scenes = EditorBuildSettings.scenes;
            if (scenes.Length == 0 || scenes[0].path != ScenePath)
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            var active = EditorSceneManager.GetActiveScene();
            if (open || created || string.IsNullOrEmpty(active.path))
                EditorSceneManager.OpenScene(ScenePath);
            if (PlayerSettings.productName != "Shehar") PlayerSettings.productName = "Shehar";
        }

        [MenuItem("Shehar/Open City Data Folder", false, 20)]
        static void OpenData() { EditorUtility.RevealInFinder(Path.Combine(Application.streamingAssetsPath, "Cities")); }

        [MenuItem("Shehar/Reset Saved Career + Settings", false, 40)]
        static void ResetPrefs()
        {
            if (EditorUtility.DisplayDialog("Reset", "Delete saved career progress, settings and key bindings?", "Delete", "Cancel"))
                PlayerPrefs.DeleteAll();
        }
    }
}
