---
title: Calling out on Hallucinations
author: sortedcord
time: 2026-07-13T06:47:00+05:30
---

Had a run of the `Talking Room` scenario right after implementing the `TimeDeltaGenerator`'s dialgoue and monologue shortcircuit. Tier 2 memory still needs some work with how it paraphrases events that occur to an entity and how it refers to itself and its surroundings.

Because of this, I think there was some mismatch with Bob's handoff call and this got fed into his long term memory:

![](../../assets/img/1_2026-07-13%2007-06-17.png)

<details>
```
Just now
  - The subject stated they had no choice but to agree to the experiment, as the alternative would have been jail. (at white-room)
    Quote: "I didn't have a choice. I would have been sent to jail if I hadn't agreed to do this experiement."
```

</details>

A bunch of things right of the bat:

- This memory entry doesn't say anywhere this was his monologue and not something he had spoken
- We shouldn't use `The subject` at all here for paraphrasing.

But because this did get added to the Actor Prompt, we got this action by Bob:

![](../../assets/img/2_2026-07-13%2007-06-34.png)

<details>
```
A fresh wave of confusion washes over me, mixing with the chilling dread already settling in my gut. "Jail? What are you talking about? I... I chose this. I signed the agreement, fully aware of what I was getting into, the... alternatives. You mean you didn't?" The idea that his agreement wasn't a choice, like mine was, only deepens the impossible rift between our experiences.
```

</details>

Bob is getting confused. This is a good thing. Our entities are not just rolling with whatever is there in the prompt. They are also checking if their own timeline makes sense (even if in a very hand-wavy way.)

This is interesting because Bill (the other entity), his previous action was:

<details>

```
I feel a fresh wave of confusion wash over me, mingling with the persistent hollowness. "I don't know how," I whisper, my voice barely audible. "I just know it is. I have nothing, just... this void. Why would I lie about something like that?" My gaze stays locked on his, searching for some understanding, some shared fragment of this impossible reality.
```

</details>

Which doesn't mention Jail at all. So we aptly then get a response from Bill:

![](../../assets/img/3_2026-07-13%2007-06-54.png)

<details>

```
I shake my head, my eyes still locked on his. "I... I didn't say 'jail' out loud, did I?" A cold dread seizes me. "But it feels like one, doesn't it? If you have nothing else to remember. And choose? How can I choose something when I don't even know what I'm choosing *from*? My memory only starts with the agreement. There was no 'before' for me, no life, no family, no choices that led me here. Just... this moment, and the void before it."
```

</details>

This is Brilliant! Bill is also confused now! And they try to reason about this. Which is actually funny! He pushes back slightly since they don't recall ever talking about a "Jail". I am literally seeing Emergent gaslighting being formed by a semantic issue in the parsing and payload.
