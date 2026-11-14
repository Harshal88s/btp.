#!/bin/bash
# Downloads the UnityEditor reference assembly (NuGet package Unity3D.SDK) used only by EditorCompileCheck.
set -e
cd "$(dirname "$0")/EditorCompileCheck"
mkdir -p ref tmp
curl -sL -o tmp/sdk.nupkg https://api.nuget.org/v3-flatcontainer/unity3d.sdk/2021.1.14.1/unity3d.sdk.2021.1.14.1.nupkg
unzip -o -q tmp/sdk.nupkg -d tmp/sdk
cp tmp/sdk/lib/UnityEditor.dll ref/
rm -rf tmp
echo "ref/UnityEditor.dll ready"
