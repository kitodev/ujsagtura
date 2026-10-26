// Igen/nem kérdés a felhasználónak (a böngésző confirm() helyett).
import { Alert } from "react-native";

export const ask = (title: string, message: string, yes = "Igen", no = "Mégse") =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: no, style: "cancel", onPress: () => resolve(false) },
        { text: yes, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
