import React, {useState} from 'react';
import {render, Text, Box, useInput} from 'ink';
import UVCControl from 'uvc-control';

type MinMax<T> = {min: T; max: T};

type Value = {
    name: string;
    type: 'NUMBER';
    value: number;
    range: MinMax<number>;
};

type Bool = {
    name: string;
    type: 'BOOLEAN';
    value: number;
};

type Range = {
    name: string;
    type: 'RANGE';
    value: number[];
    range: MinMax<Array<MinMax<number>>>;
};

type Select = {
    name: string;
    type: 'SELECT';
    value: number[];
    options: Array<[string, number]>;
};

type Field = Bool | Range | Select | Value;

//const lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a;
const clamp = (a: number, min = 0, max = 1) => Math.min(max, Math.max(min, a));
const invlerp = (x: number, y: number, a: number) => clamp((a - x) / (y - x));
//const range = (x1: number, y1: number, x2: number, y2: number, a: number) =>
//lerp(x2, y2, invlerp(x1, y1, a));

function sortBy(array, selector, desc = false) {
    return [...array].sort((a, b) => {
        a = selector(a);
        b = selector(b);

        if (a == b) return 0;
        return (desc ? a > b : a < b) ? -1 : 1;
    });
}

function ControlView(props: {values: Array<Field>; update: () => void; camera: UVCControl}) {
    const [active, setActive] = useState(0);

    const items = sortBy(props.values, (ii) => ii.name).filter((ii) => ii.type !== 'RANGE');
    const clamp = (next: number) => Math.max(0, Math.min(items.length - 1, next));
    const scale = 24;

    function onChange(index: number, up: boolean) {
        const control = items[index];
        let next: number;
        if (control.type === 'NUMBER') {
            const {min, max} = control.range;
            const increment = max / scale;
            next = up
                ? Math.min(max, control.value + increment)
                : Math.max(min, control.value - increment);
        } else if (control.type === 'BOOLEAN') {
            next = control.value === 1 ? 0 : 1;
        } else if (control.type === 'SELECT') {
            const {options, value} = control;
            const nextIndex = options.find((ii) => ii[1] === value)[1] + (up ? 1 : -1);
            next = options.slice(nextIndex % options.length)[0][1];
        } else {
            next = 0;
        }

        props.camera.set(control.name, next).catch((e) => {
            console.error(e.message);
            process.exit(0);
        });
        props.update();
    }

    useInput((input, key) => {
        if (input === 'q') {
            process.exit(1);
            // Exit program
        }

        if (key.upArrow || input === 'k') return setActive(clamp(active - 1));
        if (key.downArrow || input === 'j') return setActive(clamp(active + 1));
        if (key.leftArrow || input === 'h') return onChange(active, false);
        if (key.rightArrow || input === 'l') return onChange(active, true);
    });

    //const {issue, state, cycle, project, labels} = props;
    //const {title, identifier} = props.issue;
    //const date = format('yyyy-MM-dd HH:mm');
    return (
        <Box flexDirection="column">
            {items.map((ii, index) => {
                const isSelected = index === active;

                if (ii.type === 'BOOLEAN') {
                    return (
                        <Box key={ii.name}>
                            <Text bold={isSelected}>{isSelected ? '>' : ' '} </Text>
                            <Box width={scale}>
                                <Text bold={isSelected}>« {ii.value === 0 ? 'off' : 'on'} »</Text>
                            </Box>
                            <Text bold={isSelected}> {ii.name.replace(/_/g, ' ')}</Text>
                        </Box>
                    );
                }
                if (ii.type === 'NUMBER') {
                    //console.log(ii);
                    const {min, max} = ii.range;
                    const percentage = invlerp(min, max, ii.value);
                    return (
                        <Box key={ii.name}>
                            <Text bold={isSelected}>{isSelected ? '>' : ' '} [</Text>
                            <Box width={scale - 2}>
                                <Text bold={isSelected}>
                                    {'='.repeat(Math.round((scale - 2) * percentage))}
                                </Text>
                            </Box>
                            <Text bold={isSelected}>] {ii.name.replace(/_/g, ' ')}</Text>
                            <Text>
                                [{ii.value}] ({min}-{max})
                            </Text>
                        </Box>
                    );
                }
                if (ii.type === 'SELECT') {
                    const [label] = ii.options.find(([, value]) => value === ii.value);
                    return (
                        <Box key={ii.name}>
                            <Text bold={isSelected}>{isSelected ? '>' : ' '} </Text>
                            <Box width={scale}>
                                <Text bold={isSelected}>
                                    « {label.toLowerCase().replace(/_/g, ' ')} »
                                </Text>
                            </Box>
                            <Text bold={isSelected}> {ii.name.replace(/_/g, ' ')}</Text>
                        </Box>
                    );
                }
            })}
        </Box>
    );
}

const GET_MIN = 0x82; // Check if getting range is allowed;

export default async function controls() {
    const devices = await UVCControl.discover();
    const camera = new UVCControl({
        vid: devices[0].deviceDescriptor.idVendor
    });

    async function update() {
        //const values: Array<Value | Range | Boolean> = [];
        let controls: any = [];
        try {
            for await (const name of camera.supportedControls) {
                try {
                    const control = await camera.getControl(name);
                    const value = await camera.get(name);
                    let range = null;
                    if (control.requests.indexOf(GET_MIN) !== -1) {
                        range = await camera.range(name);
                    }

                    if (control.fields.length === 1) {
                        controls.push({control, field: control.fields[0], value, range});
                    } else {
                        controls.push({
                            control,
                            field: {type: 'RANGE'},
                            value: control.fields.map((ii) => value[ii.name]),
                            range
                        });
                    }
                } catch (e) {
                    console.log('could not fetch', name, e);
                }
            }

            const values = controls.map(({control, field, range, value}) => {
                let type: Field['type'] = field.type;
                if (field.options) type = 'SELECT';
                if (
                    (type === 'NUMBER' && range == null) ||
                    (range && range.min === 0 && range.max === 1)
                )
                    type = 'BOOLEAN';
                if (range && range.length > 1) type = 'RANGE';

                // @ts-ignore
                let next: Field = {
                    name: control.name,
                    type,
                    range,
                    value: type === 'RANGE' ? value : value[field.name]
                };

                if (next.type === 'SELECT') next.options = Object.entries(field.options);
                return next;
            });
            //console.log(values);
            //console.log(values);
            render(<ControlView values={values} update={update} camera={camera} />);
        } catch (e) {
            console.error('Render Error:', e);
        }
    }

    update();
}
