import { createAvatar} from '@dicebear/core';
import{ botttsNeutral, initials} from '@dicebear/collection';


import {cn } from "@/lib/utils";
import{ Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";

interface GeneratedAvatarProps{
    seed: string;
    className?: string;
    variant: "botttsNeutral" | "initials";
}

export const GeneratedAvatar = ({ 
    seed,
    className,
    variant 
}: GeneratedAvatarProps) => {
    let avatar;

    if (variant === "botttsNeutral") {
        avatar = createAvatar(botttsNeutral, {
            seed,
        })
    } else {
        avatar = createAvatar(initials, {
            seed,
            fontWeight: 600,
            fontSize: 40
        });
    }

    return(
        <Avatar className={cn("h-10 w-10", className)}>
            <AvatarImage src={avatar.toDataUri()} alt="Avatar" />
            <AvatarFallback>
                {seed.charAt(0).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    )
}