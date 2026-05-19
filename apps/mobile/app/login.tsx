import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native"
import { useState } from "react"

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
    // API isteği buraya gelecek
    console.log("login:", email, password)
  }

  return (
    <View style={styles.container}>

      {/* Logo / Başlık */}
      <View style={styles.header}>
        <Text style={styles.logo}>WiMZ</Text>
        <Text style={styles.subtitle}>Where is my stuff?</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      </View>

      {/* Kayıt ol linki */}
      <TouchableOpacity>
        <Text style={styles.registerText}>
          Don't have an account? <Text style={styles.registerLink}>Sign up</Text>
        </Text>
      </TouchableOpacity>

    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  logo: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#c084fc",
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginTop: 8,
  },
  form: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#c084fc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  registerText: {
    color: "#888",
    fontSize: 14,
  },
  registerLink: {
    color: "#c084fc",
    fontWeight: "bold",
  },
})
