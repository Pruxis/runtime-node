import { containsUnsafePathParts } from "./containsUnsafePathParts";

export function detectPathTraversal(
  filePath: string,
  userInput: string
): boolean {
  console.log("detectPathTraversal called for filepath "+filePath+" and userinput " + userInput);

  if (userInput.length <= 1) {
    console.log("userinput too short");

    // We ignore single characters since they don't pose a big threat.
    // TODO: evaluate if relevant/desired for path traversal
    return false;
  }

  if (!filePath.includes(userInput)) {
    console.log("userinput not detected in filePath");

    return false;
  }
  console.log("calling containsUnsafePathParts");

  return containsUnsafePathParts(filePath);
}
