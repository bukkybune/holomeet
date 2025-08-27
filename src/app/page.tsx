"use client";

import { useState } from "react"; 

import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Home() {
  const {data: session} = authClient.useSession() 

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = () => {
    authClient.signUp.email({
      email, // user email address
      password, // user password -> min 8 characters by default
      name // user display name
    }, {
      onError: () => {
        // display the error message
        window.alert("Something went wrong");
      },
      onSuccess: () => {
        // display the success message
        window.alert("User created successfully");
      }
    })
  }

    const onLogin = () => {
    authClient.signIn.email({
      email, // user email address
      password, // user password -> min 8 characters by default
    }, {
      onError: () => {
        // display the error message
        window.alert("Something went wrong");
      },
      onSuccess: () => {
        // display the success message
        window.alert("User created successfully");
      }
    })
  }

  if (session) {
    return (
      <div className="flex flex-col p-4 gap-y-4">
        <p>Logged in as {session.user.name}</p>
        <Button onClick={() => authClient.signOut()}>
          Sign out
        </Button>
      </div>
    ) 
  }

  return(
    <div className="p-4">
      <div className="flex flex-col gap-4 max-w-sm mx-auto mt-10">
        <Input 
          placeholder="Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
        />
        <Input 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
        />
        <Input 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />

        <Button onClick={onSubmit} >
          Create User
        </Button>
      </div>

      <div className="flex flex-col gap-4 max-w-sm mx-auto mt-10">
        <Input 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
        />
        <Input 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />

        <Button onClick={onLogin} >
          Login
        </Button>
      </div>
    </div>
  )
}
