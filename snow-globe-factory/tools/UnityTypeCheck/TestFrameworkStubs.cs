// Type-check-only stand-ins for Unity Test Framework types that are not available on NuGet.
// Never compiled into the Unity project (this folder is outside Assets/).
namespace UnityEngine.TestTools
{
    [System.AttributeUsage(System.AttributeTargets.Method)]
    public sealed class UnityTestAttribute : System.Attribute { }
}
